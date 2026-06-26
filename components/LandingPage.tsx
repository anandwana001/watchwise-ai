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
  ChevronRight,
  Clapperboard,
  Flame,
  Mic,
  Play,
  Search,
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
} from '@/types/conversation';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSkeleton } from './LoadingSkeleton';
import {
  detectMood,
  getTmdbBackdropUrl,
  getTmdbPosterUrl,
  pickMoodSection,
  type WatchWiseMediaItem,
  type WatchWiseSection,
} from '@/lib/watchwise';

type TMDBHomeResponse = {
  featured: WatchWiseMediaItem | null;
  sections: WatchWiseSection[];
};

type TranscriptUpdate = {
  transcriptText: string;
  latestUserText: string;
  latestAssistantText: string;
};

type WatchWiseRecommendation = {
  reply: string;
  query: string;
  mood: string | null;
  railTitle: string;
  railSubtitle: string;
  items: WatchWiseMediaItem[];
  source: string;
  warning?: string;
};

const HOME_CATALOG_CACHE_KEY = 'watchwise-home-catalog-v1';
const HOME_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

type HomeCatalogCacheEntry = {
  timestamp: number;
  data: TMDBHomeResponse;
};

function readHomeCatalogCache(): TMDBHomeResponse | null {
  if (typeof window === 'undefined') return null;

  try {
    if (catalogCache.current) {
      const cached = catalogCache.current;
      if (Date.now() - cached.timestamp < HOME_CATALOG_CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const raw = window.sessionStorage.getItem(HOME_CATALOG_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as HomeCatalogCacheEntry;
    if (
      !parsed ||
      typeof parsed.timestamp !== 'number' ||
      Date.now() - parsed.timestamp > HOME_CATALOG_CACHE_TTL_MS ||
      !parsed.data
    ) {
      return null;
    }

    catalogCache.current = parsed;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeHomeCatalogCache(data: TMDBHomeResponse) {
  const entry: HomeCatalogCacheEntry = {
    timestamp: Date.now(),
    data,
  };
  catalogCache.current = entry;

  try {
    window.sessionStorage.setItem(HOME_CATALOG_CACHE_KEY, JSON.stringify(entry));
  } catch {}
}

const catalogCache: { current: HomeCatalogCacheEntry | null } = { current: null };

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

function buildTmdbLink(item: WatchWiseMediaItem) {
  return `/title/${item.mediaType}/${item.id}`;
}

function getFallbackArtworkColors(seed: number) {
  const palettes = [
    ['#b5b5c0', '#191922'],
    ['#191922', '#383840'],
    ['#b5b5c0', '#ffffff'],
    ['#383840', '#b5b5c0'],
    ['#111111', '#191922'],
    ['#ffffff', '#b5b5c0'],
  ];

  return palettes[Math.abs(seed) % palettes.length];
}

function buildFallbackArtwork(item: WatchWiseMediaItem) {
  const [primary, secondary] = getFallbackArtworkColors(item.id);
  const label = item.mediaType === 'movie' ? 'MOVIE' : 'SHOW';
  const safeTitle = item.title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${primary}" />
          <stop offset="55%" stop-color="${secondary}" />
          <stop offset="100%" stop-color="#050505" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="25%" r="80%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.35)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect width="800" height="1200" fill="url(#bg)" />
      <circle cx="650" cy="190" r="220" fill="rgba(255,255,255,0.12)" />
      <circle cx="180" cy="920" r="260" fill="rgba(255,43,79,0.20)" />
      <rect x="48" y="880" width="704" height="230" rx="36" fill="rgba(0,0,0,0.42)" />
      <rect x="48" y="48" width="160" height="48" rx="24" fill="rgba(0,0,0,0.55)" />
      <text x="80" y="79" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="4">${label}</text>
      <text x="48" y="980" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800">${safeTitle.slice(0, 22)}</text>
      <text x="48" y="1040" fill="rgba(255,255,255,0.78)" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="500">${item.voteAverage ? `TMDB ${item.voteAverage.toFixed(1)}` : 'WatchWise selection'}</text>
      <rect x="540" y="972" width="210" height="64" rx="32" fill="#b5b5c0" />
      <text x="584" y="1013" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">PLAY</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function Row({
  section,
  featured,
}: {
  section: WatchWiseSection;
  featured?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-3xl tracking-[0.04em] text-white md:text-5xl">
            {section.title}
          </h2>
          {section.subtitle ? (
            <p className="text-sm text-white/55">{section.subtitle}</p>
          ) : null}
        </div>
        <div className="hidden items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/35 md:flex">
          <span>Browse</span>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15">
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      <div className="-mx-2 flex gap-5 overflow-x-auto px-2 pb-2 pr-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {section.items.map((item, index) => (
          <MediaCard
            key={`${item.mediaType}-${item.id}`}
            item={item}
            featured={featured && index === 0}
          />
        ))}
      </div>
    </section>
  );
}

function MediaCard({
  item,
  featured,
}: {
  item: WatchWiseMediaItem;
  featured?: boolean;
}) {
  const poster = getTmdbPosterUrl(item.posterPath, 'w500');
  const backdrop = getTmdbBackdropUrl(item.backdropPath, 'w780');
  const fallback = buildFallbackArtwork(item);
  const [imageSrc, setImageSrc] = useState(poster ?? backdrop ?? fallback);

  useEffect(() => {
    setImageSrc(poster ?? backdrop ?? fallback);
  }, [poster, backdrop, fallback]);

  return (
    <Link
      href={buildTmdbLink(item)}
      className={`group relative flex h-[280px] w-[420px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0b0b] shadow-[0_18px_50px_rgba(0,0,0,0.4)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_65px_rgba(0,0,0,0.55)] md:h-[300px] md:w-[480px] ${
        featured ? 'ring-1 ring-[#b5b5c0]/35' : ''
      }`}
    >
      <div className="relative h-full w-full overflow-hidden">
        <img
          src={imageSrc}
          alt={item.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageSrc(fallback)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-white/70 backdrop-blur">
          {item.mediaType === 'movie' ? (
            <Clapperboard className="h-3.5 w-3.5 text-[#b5b5c0]" />
          ) : (
            <Tv className="h-3.5 w-3.5 text-white/70" />
          )}
          <span>{item.mediaType}</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-5">
          <div className="flex items-end justify-between gap-4">
            <div className="max-w-[72%]">
              <h3 className="font-display line-clamp-2 text-4xl tracking-[0.05em] text-white md:text-5xl">
                {item.title}
              </h3>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#b5b5c0] text-black shadow-lg shadow-[#b5b5c0]/20 transition group-hover:scale-105">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-white/85 text-white/85" />
              {item.voteAverage ? item.voteAverage.toFixed(1) : 'New'}
            </span>
            <span className="rounded-full border border-white/10 px-2 py-1">
              Open title page
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function RecommendationRail({
  recommendation,
  loading,
}: {
  recommendation: WatchWiseRecommendation | null;
  loading: boolean;
}) {
  if (!loading && !recommendation) {
    return null;
  }

  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/35">
            Agora output
          </p>
          <h3 className="font-display mt-1 text-2xl tracking-[0.04em] text-white">
            {loading ? 'Finding exact titles...' : recommendation?.railTitle ?? 'WatchWise picks'}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/65">
            {loading
              ? 'WatchWise is matching your mood to titles from TMDB.'
              : recommendation?.reply}
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/45">
          TMDB
        </div>
      </div>

      {recommendation?.railSubtitle ? (
        <p className="mt-3 text-xs text-white/45">{recommendation.railSubtitle}</p>
      ) : null}

      {recommendation?.items?.length ? (
        <div className="-mx-2 mt-4 flex gap-3 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recommendation.items.map((item) => {
            const poster = getTmdbPosterUrl(item.posterPath, 'w342');
            const imageSrc = poster ?? getTmdbBackdropUrl(item.backdropPath, 'w780');

            return (
              <Link
                key={`${item.mediaType}-${item.id}`}
                href={buildTmdbLink(item)}
                className="group relative w-[170px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/60 transition hover:-translate-y-0.5 hover:border-white/20"
              >
                <div className="relative aspect-[2/3] w-full bg-[#111111]">
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                </div>
                <div className="space-y-1 p-3">
                  <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-white">
                    {item.title}
                  </h4>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                    {item.mediaType}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export default function LandingPage() {
  const [catalog, setCatalog] = useState<TMDBHomeResponse>({
    featured: null,
    sections: [],
  });
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);
  const [transcriptState, setTranscriptState] = useState<TranscriptUpdate | null>(
    null,
  );
  const [activeMood, setActiveMood] = useState<
    ReturnType<typeof detectMood>
  >(null);
  const [recommendation, setRecommendation] =
    useState<WatchWiseRecommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cachedCatalog = readHomeCatalogCache();
    if (cachedCatalog) {
      setCatalog(cachedCatalog);
      setCatalogLoading(false);
      setCatalogError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setCatalogLoading(true);
        const response = await fetch('/api/tmdb/home');
        const data = (await response.json()) as TMDBHomeResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? 'Failed to load catalog');
        }

        if (!cancelled) {
          setCatalog({
            featured: data.featured,
            sections: data.sections ?? [],
          });
          setCatalogError(null);
          writeHomeCatalogCache({
            featured: data.featured,
            sections: data.sections ?? [],
          });
        }
      } catch (tmdbError) {
        if (!cancelled) {
          setCatalogError(
            tmdbError instanceof Error
              ? tmdbError.message
              : 'Failed to load catalog',
          );
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      drawerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const query = [
      transcriptState?.latestUserText,
      transcriptState?.transcriptText,
      activeMood?.label,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!query) {
      setRecommendation(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setRecommendationLoading(true);
        const response = await fetch('/api/watchwise/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            transcriptText: transcriptState?.transcriptText,
            latestUserText: transcriptState?.latestUserText,
            latestAssistantText: transcriptState?.latestAssistantText,
          }),
          signal: controller.signal,
        });

        const data = (await response.json()) as WatchWiseRecommendation;
        if (!response.ok) {
          throw new Error(data.warning ?? 'Failed to load recommendations');
        }

        setRecommendation(data);
      } catch (recommendationError) {
        if (!controller.signal.aborted) {
          console.error('Failed to load WatchWise recommendations:', recommendationError);
          setRecommendation(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setRecommendationLoading(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    activeMood?.label,
    drawerOpen,
    transcriptState?.latestAssistantText,
    transcriptState?.latestUserText,
    transcriptState?.transcriptText,
  ]);

  const startConversation = useCallback(async () => {
    if (isBootstrapping || (drawerOpen && agoraData && rtmClient)) {
      return;
    }

    setDrawerOpen(true);
    setIsBootstrapping(true);
    setError(null);
    setAgentJoinError(false);

    try {
      const agoraResponse = await fetch('/api/generate-agora-token');
      const responseData = await agoraResponse.json();

      if (!agoraResponse.ok) {
        throw new Error(
          `Failed to generate Agora token: ${JSON.stringify(responseData)}`,
        );
      }

      const [agentData, rtm] = await Promise.all([
        fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requester_id: responseData.uid,
            channel_name: responseData.channel,
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
            console.error('Failed to start conversation with agent:', inviteError);
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
      setError('Failed to start WatchWise AI. Please try again.');
      console.error('Error starting conversation:', startError);
    } finally {
      setIsBootstrapping(false);
    }
  }, [agoraData, drawerOpen, isBootstrapping, rtmClient]);

  const handleTranscriptUpdate = useCallback((payload: TranscriptUpdate) => {
    setTranscriptState(payload);
    setActiveMood(
      detectMood(`${payload.latestUserText} ${payload.transcriptText}`) ??
        null,
    );
  }, []);

  const handleTokenWillExpire = useCallback(
    async (uid: string): Promise<AgoraRenewalTokens> => {
      try {
        const channel = agoraData?.channel;
        if (!channel) {
          throw new Error('Missing channel for token renewal');
        }

        const [rtcResponse, rtmResponse] = await Promise.all([
          fetch(`/api/generate-agora-token?channel=${channel}&uid=${uid}`),
          fetch(`/api/generate-agora-token?channel=${channel}&uid=${agoraData.uid}`),
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
      } catch (tokenError) {
        console.error('Error renewing token:', tokenError);
        throw tokenError;
      }
    },
    [agoraData],
  );

  const handleEndConversation = useCallback(async () => {
    if (agoraData?.agentId) {
      try {
        const response = await fetch('/api/stop-conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agoraData.agentId }),
        });
        if (!response.ok) {
          console.error('Failed to stop agent:', await response.text());
        }
      } catch (endError) {
        console.error('Error stopping agent:', endError);
      }
    }

    rtmClient?.logout().catch((rtmError) =>
      console.error('RTM logout error:', rtmError),
    );
    setRtmClient(null);
    setAgoraData(null);
    setDrawerOpen(false);
    setTranscriptState(null);
    setActiveMood(null);
  }, [agoraData, rtmClient]);

  const recommendedSection = useMemo(() => {
    if (!activeMood) {
      return null;
    }

    return pickMoodSection(activeMood, catalog.sections);
  }, [activeMood, catalog.sections]);

  const sections = useMemo(() => {
    if (recommendedSection) {
      const rest = catalog.sections.filter(
        (section) => section.id !== recommendedSection.id,
      );
      return [recommendedSection, ...rest];
    }
    return catalog.sections;
  }, [catalog.sections, recommendedSection]);

  const featured = catalog.featured ?? catalog.sections[0]?.items[0] ?? null;
  const heroBackdrop = featured
    ? getTmdbBackdropUrl(featured.backdropPath, 'w1280') ??
      getTmdbPosterUrl(featured.posterPath, 'w780')
    : null;

  return (
    <div className="min-h-dvh bg-[#000000] text-white">
      <div className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(181,181,192,0.14),_transparent_30%),linear-gradient(180deg,_#111111_0%,_#070707_48%,_#000000_100%)]">
        <div className="absolute inset-0 opacity-35">
          <div className="absolute left-[-12%] top-[-8%] h-72 w-72 rounded-full bg-[#b5b5c0]/12 blur-[120px]" />
          <div className="absolute right-[-12%] top-[20%] h-80 w-80 rounded-full bg-white/8 blur-[140px]" />
          <div className="absolute bottom-[-10%] left-[20%] h-72 w-72 rounded-full bg-[#191922]/90 blur-[140px]" />
        </div>

        <header className="relative z-20 border-b border-white/8 bg-black/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-4 py-4 md:px-8">
            <div className="flex items-center gap-6">
              <div className="text-2xl font-black uppercase tracking-[-0.06em] brand-z-text md:text-4xl">
                WatchWise
              </div>
              <nav className="hidden items-center gap-7 text-sm font-medium text-white/78 md:flex">
                {['Home', 'Shows', 'Movies', 'New & Popular', 'My List'].map(
                  (item) => (
                    <button
                      key={item}
                      className="transition hover:text-white"
                      type="button"
                    >
                      {item}
                    </button>
                  ),
                )}
              </nav>
            </div>

            <div className="flex items-center gap-3 md:gap-5">
              <button
                type="button"
                className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 md:inline-flex"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
              <button
                type="button"
                onClick={startConversation}
                className="inline-flex items-center gap-2 rounded-full bg-[#b5b5c0] px-4 py-2 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(181,181,192,0.24)] transition hover:scale-[1.02] hover:bg-[#d1d1da]"
              >
                <Mic className="h-4 w-4" />
                Agora
              </button>
              <button
                type="button"
                className="hidden rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 md:inline-flex"
              >
                Children
              </button>
              <div className="h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-white/10">
                <Image
                  src="https://image.tmdb.org/t/p/w185/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg"
                  alt="Profile"
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </div>
            </div>
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
                {heroBackdrop ? (
                  <Image
                    src={heroBackdrop}
                    alt={featured?.title ?? 'Featured title'}
                    fill
                    className="object-cover opacity-40"
                    sizes="100vw"
                    unoptimized
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
              </div>

              <div className="relative grid min-h-[540px] gap-10 px-6 py-8 md:px-10 md:py-10 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="flex max-w-3xl flex-col justify-end gap-6">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-black/55 px-4 py-2 text-xs font-medium uppercase tracking-[0.32em] text-white/70 backdrop-blur">
                    <Sparkles className="h-3.5 w-3.5 text-[#b5b5c0]" />
                    Voice-powered OTT discovery
                  </div>

                  <div className="space-y-4">
                    <h1 className="font-display max-w-3xl text-5xl tracking-[0.05em] text-white md:text-7xl xl:text-8xl">
                      Your next watch.
                      <span className="block brand-rainbow-text">
                        Found by voice.
                      </span>
                    </h1>
                    <p className="max-w-2xl text-base leading-8 text-white/72 md:text-lg">
                      Ask WatchWise for horror, happy movies, date-night shows,
                      or anything in between. Agora AI listens, and the TMDB
                      catalog updates with rows you can click instantly.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={startConversation}
                      className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
                    >
                      <Image
                        src="/agora-logo-mark.svg"
                        alt=""
                        width={18}
                        height={18}
                        className="h-[18px] w-[18px]"
                        aria-hidden="true"
                      />
                      <span>Talk to Agora</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById('catalog-rows')
                          ?.scrollIntoView({ behavior: 'smooth' })
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-6 py-3 text-sm font-medium text-white/88 transition hover:bg-white/10"
                    >
                      Explore rows
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {['Horror', 'Happy', 'Action', 'Romance', 'Mystery'].map(
                      (label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            const mood = detectMood(label) ?? detectMood(`${label} movies`);
                            setActiveMood(mood);
                            setDrawerOpen(true);
                          }}
                          className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="flex items-end justify-end">
                  <div className="w-full max-w-md space-y-4 rounded-[28px] border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                          Featured
                        </p>
                        <h2 className="font-display mt-1 text-3xl tracking-[0.04em]">
                          {featured?.title ?? 'Trending tonight'}
                        </h2>
                      </div>
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/6">
                        <Flame className="h-5 w-5 text-[#b5b5c0]" />
                      </div>
                    </div>

                    <p className="line-clamp-4 text-sm leading-6 text-white/70">
                      {featured?.overview ??
                        'Use the Agora button to open the right-side assistant and ask for a mood-based list of titles.'}
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
                      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                        <p className="text-white/45">Mood match</p>
                        <p className="mt-1 font-semibold text-white">
                          {activeMood?.label ?? 'Live voice'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                        <p className="text-white/45">Catalog source</p>
                        <p className="mt-1 font-semibold text-white">TMDB</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/6 p-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#b5b5c0] text-black">
                        <Mic className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">
                          Say: "I want something scary"
                        </p>
                        <p className="text-xs text-white/45">
                          WatchWise will surface matching rows on the left.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {catalogError ? (
              <div className="rounded-[24px] border border-[#b5b5c0]/30 bg-[#b5b5c0]/10 px-5 py-4 text-sm text-[#ededf3]">
                TMDB catalog error: {catalogError}
              </div>
            ) : null}

            {transcriptState?.latestUserText ? (
              <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
                <span className="font-semibold text-white">Last heard:</span>{' '}
                {transcriptState.latestUserText}
                {activeMood ? (
                  <span className="ml-3 inline-flex rounded-full bg-[#b5b5c0]/18 px-3 py-1 text-xs font-semibold text-[#ededf3]">
                    Matched: {activeMood.label}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div id="catalog-rows" className="space-y-10 pb-10">
              {catalogLoading ? (
                <div className="rounded-[24px] border border-white/10 bg-white/5 px-6 py-10 text-white/55">
                  Loading TMDB catalog...
                </div>
              ) : sections.length > 0 ? (
                sections.map((section, index) => (
                  <Row
                    key={section.id}
                    section={section}
                    featured={index === 0}
                  />
                ))
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-white/5 px-6 py-10 text-white/55">
                  No catalog rows are available yet. Add `TMDB_API_KEY` to your
                  environment and refresh.
                </div>
              )}
            </div>
          </div>
        </main>

        <aside
          className={`fixed inset-y-0 right-0 z-40 w-full max-w-[520px] border-l border-white/10 bg-[#0b0b0b]/96 shadow-[0_0_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform duration-300 ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-label="Agora assistant drawer"
        >
          <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/35">
                      Agora
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
                  WatchWise assistant
                </h2>
              </div>
              <button
                type="button"
                onClick={handleEndConversation}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white/70 transition hover:bg-white/12 hover:text-white"
                aria-label="Close WatchWise assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={drawerRef} className="min-h-0 flex-1 overflow-y-auto p-4">
              {error ? (
                <div className="mb-4 rounded-2xl border border-[#b5b5c0]/30 bg-[#b5b5c0]/10 px-4 py-3 text-sm text-[#ededf3]">
                  {error}
                </div>
              ) : null}

              {agentJoinError ? (
                <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  The voice assistant connected, but the agent invite reported a
                  warning. You can still browse the catalog.
                </div>
              ) : null}

              {!agoraData || !rtmClient ? (
                <div className="flex min-h-[70vh] flex-col justify-center gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/55">
                    <Mic className="h-3.5 w-3.5 text-[#b5b5c0]" />
                    Voice session
                  </div>
                  <h3 className="font-display text-3xl tracking-[0.04em] text-white">
                    {isBootstrapping
                      ? 'Starting Agora...'
                      : 'Ask for a mood and get instant rows'}
                  </h3>
                  <p className="leading-7 text-white/65">
                    Say things like "something scary", "funny movies", or
                    "a feel-good show". WatchWise will highlight a matching
                    row from the TMDB catalog.
                  </p>
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white/60">
                    {isBootstrapping
                      ? 'Bootstrapping the RTC and RTM session...'
                      : 'Use the Agora button again to open the assistant.'}
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
                        onTranscriptUpdate={handleTranscriptUpdate}
                      />
                    </AgoraProvider>
                  </ErrorBoundary>
                </Suspense>
              )}

              {agoraData && rtmClient ? (
                <RecommendationRail
                  recommendation={recommendation}
                  loading={recommendationLoading}
                />
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
