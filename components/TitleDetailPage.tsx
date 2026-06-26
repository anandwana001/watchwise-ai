'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Clapperboard,
  Mic,
  Play,
  Sparkles,
  Star,
  Tv,
  X,
} from 'lucide-react';
import type { RTMClient } from 'agora-rtm';
import type {
  AgoraRenewalTokens,
  AgoraTokenData,
  AgentResponse,
  ClientStartRequest,
  WatchWiseConversationContext,
} from '@/types/conversation';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSkeleton } from './LoadingSkeleton';
import {
  fetchTitleDetails,
  type TitleDetailsResponse,
} from '@/lib/tmdb-title';
import {
  getTmdbBackdropUrl,
  getTmdbPosterUrl,
  type WatchWiseMediaItem,
} from '@/lib/watchwise';

const TITLE_CACHE_TTL_MS = 10 * 60 * 1000;

function getTitleCacheKey(mediaType: 'movie' | 'tv', id: string) {
  return `watchwise-title-${mediaType}-${id}-v1`;
}

function readTitleCache(mediaType: 'movie' | 'tv', id: string) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(getTitleCacheKey(mediaType, id));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      timestamp: number;
      data: TitleDetailsResponse;
    };

    if (
      !parsed ||
      typeof parsed.timestamp !== 'number' ||
      Date.now() - parsed.timestamp > TITLE_CACHE_TTL_MS
    ) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function writeTitleCache(
  mediaType: 'movie' | 'tv',
  id: string,
  data: TitleDetailsResponse,
) {
  try {
    window.sessionStorage.setItem(
      getTitleCacheKey(mediaType, id),
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
    );
  } catch {}
}

const ConversationComponent = dynamic(
  () => import('./ConversationComponent'),
  { ssr: false },
);

const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } =
      await import('agora-rtc-react');

    return {
      default: function AgoraProviders({
        children,
      }: {
        children: ReactNode;
      }) {
        const clientRef = useRef<ReturnType<
          typeof AgoraRTC.createClient
        > | null>(null);

        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8',
          });
        }

        return (
          <AgoraRTCProvider client={clientRef.current}>
            {children}
          </AgoraRTCProvider>
        );
      },
    };
  },
  { ssr: false },
);

function buildTitleContext(
  media: WatchWiseMediaItem,
  details: TitleDetailsResponse['details'],
): WatchWiseConversationContext {
  return {
    title: media.title,
    mediaType: media.mediaType,
    overview: media.overview,
    tagline: details.tagline,
    genres: details.genres.map((genre) => genre.name),
    cast: details.cast,
    crew: details.crew.map((entry) => `${entry.name} (${entry.job})`),
    runtime: details.runtime,
    seasons: details.seasons,
    episodes: details.episodes,
    status: details.status,
    homepage: details.homepage,
    imdbId: details.imdbId,
    productionCompanies: details.productionCompanies,
    productionCountries: details.productionCountries,
    spokenLanguages: details.spokenLanguages,
    networks: details.networks,
    createdBy: details.createdBy,
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat(undefined).format(value);
}

function joinList(values: string[] | null | undefined) {
  return values?.length ? values.join(', ') : 'N/A';
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <p className="text-xs uppercase tracking-[0.28em] text-white/35">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 text-white/80">{value}</div>
    </div>
  );
}

type TitleDetailPageProps = {
  mediaType: 'movie' | 'tv';
  id: string;
  initialData?: TitleDetailsResponse | null;
};

export default function TitleDetailPage({
  mediaType,
  id,
  initialData = null,
}: TitleDetailPageProps) {
  const [titleData, setTitleData] = useState<TitleDetailsResponse | null>(
    initialData,
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(
    null,
  );
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialData) {
      setLoading(false);
      return;
    }

    const cachedTitle = readTitleCache(mediaType, id);
    if (cachedTitle) {
      setTitleData(cachedTitle);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const data = await fetchTitleDetails(mediaType, id);

        if (!cancelled) {
          setTitleData(data);
          setError(null);
          writeTitleCache(mediaType, id, data);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Failed to load title',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, mediaType, initialData]);

  useEffect(() => {
    if (drawerOpen) {
      drawerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [drawerOpen]);

  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);

  const titleContext = useMemo(
    () =>
      titleData ? buildTitleContext(titleData.media, titleData.details) : null,
    [titleData],
  );

  const startConversation = useCallback(async () => {
    if (isBootstrapping || (drawerOpen && agoraData && rtmClient)) {
      return;
    }

    setDrawerOpen(true);
    setIsBootstrapping(true);
    setConversationError(null);
    setAgentJoinError(false);

    try {
      const agoraResponse = await fetch('/api/generate-agora-token');
      const responseData = await agoraResponse.json();

      if (!agoraResponse.ok) {
        throw new Error(
          `Failed to generate Agora token: ${JSON.stringify(responseData)}`,
        );
      }

      const context = titleContext ?? undefined;

      const [agentData, rtm] = await Promise.all([
        fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
            context,
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) {
              setAgentJoinError(true);
              return null;
            }
            return res.json() as Promise<AgentResponse>;
          })
          .catch((inviteError) => {
            console.error('Failed to start title conversation with agent:', inviteError);
            setAgentJoinError(true);
            return null;
          }),
        (async () => {
          const { default: AgoraRTM } = await import('agora-rtm');
          const nextRtm: RTMClient = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            responseData.uid,
          );
          await nextRtm.login({ token: responseData.token });
          await nextRtm.subscribe(responseData.channel);
          return nextRtm;
        })(),
      ]);

      setRtmClient(rtm);
      setAgoraData({ ...responseData, agentId: agentData?.agent_id });
    } catch (startError) {
      setConversationError(
        'Failed to start the title assistant. Please try again.',
      );
      console.error('Error starting title conversation:', startError);
    } finally {
      setIsBootstrapping(false);
    }
  }, [agoraData, drawerOpen, isBootstrapping, rtmClient, titleContext]);

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      if (!agoraData?.channel) {
        throw new Error('Missing channel for token renewal');
      }

      const [rtcResponse, rtmResponse] = await Promise.all([
        fetch(`/api/generate-agora-token?channel=${agoraData.channel}&uid=${uid}`),
        fetch(
          `/api/generate-agora-token?channel=${agoraData.channel}&uid=${agoraData.uid}`,
        ),
      ]);
      const [rtcData, rtmData] = await Promise.all([
        rtcResponse.json(),
        rtmResponse.json(),
      ]);

      if (!rtcResponse.ok || !rtmResponse.ok) {
        throw new Error('Failed to generate renewal tokens');
      }

      return {
        rtcToken: rtcData.token,
        rtmToken: rtmData.token,
      };
    },
    [agoraData],
  );

  const handleEndConversation = useCallback(() => {
    if (agoraData?.agentId) {
      fetch('/api/stop-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agoraData.agentId }),
      }).catch((stopError) => {
        console.error('Error stopping title agent:', stopError);
      });
    }

    rtmClient?.logout().catch((rtmError) =>
      console.error('RTM logout error:', rtmError),
    );
    setRtmClient(null);
    setAgoraData(null);
    setDrawerOpen(false);
  }, [agoraData, rtmClient]);

  const poster = titleData
    ? getTmdbPosterUrl(titleData.media.posterPath, 'w780')
    : null;
  const backdrop = titleData
    ? getTmdbBackdropUrl(titleData.media.backdropPath, 'w1280')
    : null;
  const heroImage = backdrop ?? poster;
  const details = titleData?.details;
  const rawDetails = details?.raw
    ? JSON.stringify(details.raw, null, 2)
    : '';

  return (
    <div className="min-h-dvh bg-[#000000] text-white">
      <div className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(181,181,192,0.12),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#070707_48%,_#000000_100%)]">
        <div className="absolute inset-0 opacity-35">
          <div className="absolute left-[-12%] top-[-8%] h-72 w-72 rounded-full bg-[#b5b5c0]/12 blur-[120px]" />
          <div className="absolute right-[-12%] top-[20%] h-80 w-80 rounded-full bg-white/8 blur-[140px]" />
          <div className="absolute bottom-[-10%] left-[20%] h-72 w-72 rounded-full bg-[#191922]/90 blur-[140px]" />
        </div>

        <header className="relative z-20 border-b border-white/8 bg-black/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 md:px-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/80 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>

            <button
              type="button"
              onClick={startConversation}
              className="inline-flex items-center gap-2 rounded-full bg-[#b5b5c0] px-4 py-2 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(181,181,192,0.24)] transition hover:scale-[1.02] hover:bg-[#d1d1da]"
            >
              <Mic className="h-4 w-4" />
              Talk to Agora
            </button>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex max-w-[1600px] gap-0 px-4 pb-10 pt-6 md:px-8">
          <div
            className={`min-w-0 flex-1 space-y-10 transition-[padding-right] duration-300 ${
              drawerOpen ? 'lg:pr-[430px]' : 'lg:pr-0'
            }`}
          >
            <section className="relative overflow-hidden rounded-[32px] border border-white/8 bg-[#111111] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-0">
                {heroImage ? (
                  <Image
                    src={heroImage}
                    alt={titleData?.media.title ?? 'Title artwork'}
                    fill
                    className="object-cover opacity-35"
                    sizes="100vw"
                    unoptimized
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/72 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
              </div>

              <div className="relative grid gap-8 px-6 py-8 md:px-10 md:py-10 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="flex justify-center xl:justify-start">
                  <div className="relative w-full max-w-[320px] overflow-hidden rounded-[28px] border border-white/10 bg-black/40 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                    <div className="relative aspect-[2/3]">
                      {poster ? (
                        <Image
                          src={poster}
                          alt={titleData?.media.title ?? 'Title poster'}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 70vw, 320px"
                          unoptimized
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-end gap-5">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-black/55 px-4 py-2 text-xs font-medium uppercase tracking-[0.32em] text-white/70 backdrop-blur">
                    <Sparkles className="h-3.5 w-3.5 text-[#b5b5c0]" />
                    Title detail page
                  </div>

                  <div className="space-y-4">
                    <h1 className="font-display max-w-3xl text-5xl tracking-[0.05em] text-white md:text-7xl xl:text-8xl">
                      {loading ? 'Loading title...' : titleData?.media.title}
                    </h1>
                    {details?.tagline ? (
                      <p className="max-w-2xl text-lg text-white/75">
                        {details.tagline}
                      </p>
                    ) : null}
                    <p className="max-w-3xl text-base leading-8 text-white/72 md:text-lg">
                      {titleData?.media.overview ??
                        'This title page shows the full TMDB detail view and lets you ask Agora about the cast, summary, tone, and other facts about the selected movie or show.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1">
                      <Star className="h-3.5 w-3.5 fill-white/90 text-white/90" />
                      {titleData?.media.voteAverage
                        ? titleData.media.voteAverage.toFixed(1)
                        : 'New'}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1">
                      {titleData?.media.mediaType === 'movie' ? (
                        <Clapperboard className="h-3.5 w-3.5 text-[#b5b5c0]" />
                      ) : (
                        <Tv className="h-3.5 w-3.5 text-[#b5b5c0]" />
                      )}
                      {titleData?.media.mediaType}
                    </span>
                    {details?.runtime ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1">
                        {details.runtime} min
                      </span>
                    ) : null}
                    {details?.seasons ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1">
                        {details.seasons} seasons
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {details?.genres?.map((genre) => (
                      <span
                        key={genre.id}
                        className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-white/70"
                      >
                        {genre.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-3xl tracking-[0.04em] text-white">
                  Cast
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {details?.cast?.length ? (
                    details.cast.map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/75"
                      >
                        {name}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-white/50">
                      Cast information will appear here after the title loads.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-3xl tracking-[0.04em] text-white">
                  About this title
                </h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-white/70">
                  <p>
                    Ask Agora questions like:
                  </p>
                  <ul className="space-y-2 text-white/60">
                    <li>• Who is in the cast?</li>
                    <li>• What is the summary without spoilers?</li>
                    <li>• Is it good for a horror or date-night vibe?</li>
                    <li>• What similar titles should I watch next?</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={startConversation}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#b5b5c0] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#d1d1da]"
                >
                  <Play className="h-4 w-4" />
                  Start title conversation
                </button>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <h2 className="font-display text-3xl tracking-[0.04em] text-white">
                TMDB Details
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <DetailField
                  label="Release / First Air"
                  value={
                    titleData?.media.mediaType === 'movie'
                      ? formatDate(titleData?.media.releaseDate)
                      : formatDate(titleData?.media.firstAirDate)
                  }
                />
                <DetailField
                  label="Status"
                  value={details?.status ?? 'N/A'}
                />
                <DetailField
                  label="Runtime"
                  value={details?.runtime ? `${details.runtime} min` : 'N/A'}
                />
                <DetailField
                  label="Seasons"
                  value={formatNumber(details?.seasons)}
                />
                <DetailField
                  label="Episodes"
                  value={formatNumber(details?.episodes)}
                />
                <DetailField
                  label="Original Language"
                  value={details?.originalLanguage?.toUpperCase() ?? 'N/A'}
                />
                <DetailField
                  label="Popularity"
                  value={formatNumber(details?.popularity)}
                />
                <DetailField
                  label="Vote Count"
                  value={formatNumber(details?.voteCount)}
                />
                <DetailField
                  label="IMDb"
                  value={
                    details?.imdbId ? (
                      <a
                        href={`https://www.imdb.com/title/${details.imdbId}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-white/30 underline-offset-4 transition hover:decoration-white"
                      >
                        {details.imdbId}
                      </a>
                    ) : (
                      'N/A'
                    )
                  }
                />
                <DetailField
                  label="Homepage"
                  value={
                    details?.homepage ? (
                      <a
                        href={details.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all underline decoration-white/30 underline-offset-4 transition hover:decoration-white"
                      >
                        {details.homepage}
                      </a>
                    ) : (
                      'N/A'
                    )
                  }
                />
                <DetailField
                  label="Budget"
                  value={formatMoney(details?.budget)}
                />
                <DetailField
                  label="Revenue"
                  value={formatMoney(details?.revenue)}
                />
                <DetailField
                  label="Last Air Date"
                  value={formatDate(details?.lastAirDate)}
                />
                <DetailField
                  label="Next Air Date"
                  value={formatDate(details?.nextAirDate)}
                />
                <DetailField
                  label="Origin Countries"
                  value={joinList(details?.originCountries)}
                />
                <DetailField
                  label="Spoken Languages"
                  value={joinList(details?.spokenLanguages)}
                />
                <DetailField
                  label="Production Countries"
                  value={joinList(details?.productionCountries)}
                />
                <DetailField
                  label="Production Companies"
                  value={joinList(details?.productionCompanies)}
                />
                <DetailField
                  label="Networks"
                  value={joinList(details?.networks)}
                />
                <DetailField
                  label="Created By"
                  value={joinList(details?.createdBy)}
                />
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-3xl tracking-[0.04em] text-white">
                  Crew
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {details?.crew?.length ? (
                    details.crew.map((person) => (
                      <span
                        key={`${person.name}-${person.job}`}
                        className="rounded-full border border-white/10 bg-black/45 px-3 py-2 text-sm text-white/75"
                        title={person.job}
                      >
                        {person.name} · {person.job}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-white/50">
                      Crew information not available.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <h2 className="font-display text-3xl tracking-[0.04em] text-white">
                  Seasons
                </h2>
                <div className="mt-4 space-y-3">
                  {details?.seasonsList?.length ? (
                    details.seasonsList.map((season) => (
                      <div
                        key={`${season.seasonNumber}-${season.name}`}
                        className="rounded-2xl border border-white/10 bg-black/35 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {season.name}
                            </p>
                            <p className="text-xs text-white/45">
                              {season.airDate ? formatDate(season.airDate) : 'TBA'}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/65">
                            {formatNumber(season.episodeCount)} episodes
                          </span>
                        </div>
                        {season.overview ? (
                          <p className="mt-3 text-sm leading-6 text-white/65">
                            {season.overview}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-white/50">
                      Season information not available.
                    </span>
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>

        <aside
          className={`fixed inset-y-0 right-0 z-40 w-full max-w-[520px] border-l border-white/10 bg-[#0b0b0b]/96 shadow-[0_0_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform duration-300 ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-label="Agora title assistant drawer"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/35">
                  Agora
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
                  Ask about {titleData?.media.title ?? 'this title'}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleEndConversation}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/70 transition hover:bg-white/12 hover:text-white"
                aria-label="Close title assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={drawerRef} className="min-h-0 flex-1 overflow-y-auto p-4">
              {conversationError ? (
                <div className="mb-4 rounded-2xl border border-[#b5b5c0]/30 bg-[#b5b5c0]/10 px-4 py-3 text-sm text-[#ededf3]">
                  {conversationError}
                </div>
              ) : null}

              {agentJoinError ? (
                <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  The assistant connected, but the agent invite reported a
                  warning.
                </div>
              ) : null}

              {!agoraData || !rtmClient ? (
                <div className="flex min-h-[70vh] flex-col justify-center gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/55">
                    <Mic className="h-3.5 w-3.5 text-[#b5b5c0]" />
                    Title session
                  </div>
                  <h3 className="font-display text-3xl tracking-[0.04em] text-white">
                    {isBootstrapping
                      ? 'Starting Agora...'
                      : `Ask about ${titleData?.media.title ?? 'this title'}`}
                  </h3>
                  <p className="leading-7 text-white/65">
                    Ask about cast, summary, release info, or what similar titles
                    to watch next. The agent will stay grounded in this title.
                  </p>
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white/60">
                    {isBootstrapping
                      ? 'Bootstrapping the RTC and RTM session...'
                      : 'Use the Talk to Agora button to open the assistant.'}
                  </div>
                </div>
              ) : (
                <Suspense fallback={<LoadingSkeleton />}>
                  <ErrorBoundary>
                    <AgoraProvider>
                      <ConversationComponent
                        agoraData={agoraData}
                        rtmClient={rtmClient}
                        onTokenWillExpire={handleTokenWillExpire}
                        onEndConversation={handleEndConversation}
                      />
                    </AgoraProvider>
                  </ErrorBoundary>
                </Suspense>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
