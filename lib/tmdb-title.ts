import type { WatchWiseMediaItem } from './watchwise';
import { logExternalRequest, logExternalResponse } from './api-logging';

export type TitleDetailsResponse = {
  media: WatchWiseMediaItem;
  details: {
    runtime: number | null;
    seasons: number | null;
    episodes: number | null;
    status: string | null;
    tagline: string | null;
    homepage: string | null;
    imdbId: string | null;
    popularity: number | null;
    voteCount: number | null;
    originalLanguage: string | null;
    budget: number | null;
    revenue: number | null;
    lastAirDate: string | null;
    nextAirDate: string | null;
    createdBy: string[];
    networks: string[];
    productionCompanies: string[];
    productionCountries: string[];
    spokenLanguages: string[];
    originCountries: string[];
    seasonsList: Array<{
      name: string;
      episodeCount: number | null;
      seasonNumber: number | null;
      airDate: string | null;
      overview: string;
    }>;
    genres: Array<{ id: number; name: string }>;
    cast: string[];
    crew: Array<{ name: string; job: string }>;
    raw: Record<string, unknown>;
  };
};

type TMDBMediaType = 'movie' | 'tv';

type TitleDetails = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string | null;
  first_air_date?: string | null;
  genre_ids?: number[];
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  genres?: Array<{ id: number; name: string }>;
  status?: string;
  tagline?: string;
  homepage?: string | null;
  imdb_id?: string | null;
  popularity?: number | null;
  vote_count?: number | null;
  original_language?: string | null;
  budget?: number | null;
  revenue?: number | null;
  last_air_date?: string | null;
  next_episode_to_air?: { air_date?: string | null } | null;
  created_by?: Array<{ name?: string }>;
  networks?: Array<{ name?: string }>;
  production_companies?: Array<{ name?: string }>;
  production_countries?: Array<{ name?: string }>;
  spoken_languages?: Array<{ english_name?: string; name?: string }>;
  origin_country?: string[];
  seasons?: Array<{
    name?: string;
    episode_count?: number | null;
    season_number?: number | null;
    air_date?: string | null;
    overview?: string;
  }>;
  credits?: {
    cast?: Array<{ name?: string; character?: string }>;
    crew?: Array<{ name?: string; job?: string }>;
  };
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toMediaItem(mediaType: TMDBMediaType, media: TitleDetails): WatchWiseMediaItem {
  return {
    id: media.id,
    mediaType,
    title: media.title ?? media.name ?? 'Untitled',
    overview: media.overview ?? '',
    posterPath: media.poster_path ?? null,
    backdropPath: media.backdrop_path ?? null,
    voteAverage: media.vote_average ?? 0,
    releaseDate: media.release_date ?? null,
    firstAirDate: media.first_air_date ?? null,
    genreIds: media.genre_ids ?? [],
  };
}

function extractNames(items?: Array<{ name?: string }>) {
  return (items ?? [])
    .map((item) => item.name)
    .filter(Boolean) as string[];
}

export async function fetchTitleDetails(
  mediaType: TMDBMediaType,
  id: string,
): Promise<TitleDetailsResponse> {
  const startedAt = Date.now();
  const apiKey = requireEnv('TMDB_API_KEY');
  const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${id}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('append_to_response', 'credits,images,videos');

  logExternalRequest('tmdb', {
    url: url.toString(),
    method: 'GET',
  });

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });

  const body = (await response.json()) as TitleDetails;
  logExternalResponse('tmdb', {
    status: response.status,
    body: {
      ok: response.ok,
      mediaType,
      id,
      posterPath: body?.poster_path ?? null,
      backdropPath: body?.backdrop_path ?? null,
      cast: body?.credits?.cast?.slice(0, 8).map((item) => item.name),
    },
    durationMs: Date.now() - startedAt,
  });

  if (!response.ok) {
    throw new Error(`TMDB ${mediaType} details request failed: ${response.status}`);
  }

  const cast = (body?.credits?.cast ?? [])
    .slice(0, 10)
    .map((entry) => entry.name)
    .filter(Boolean) as string[];

  return {
    media: toMediaItem(mediaType, body),
    details: {
      runtime: body?.runtime ?? body?.episode_run_time?.[0] ?? null,
      seasons: body?.number_of_seasons ?? null,
      episodes: body?.number_of_episodes ?? null,
      status: body?.status ?? null,
      tagline: body?.tagline ?? null,
      homepage: body?.homepage ?? null,
      imdbId: body?.imdb_id ?? null,
      popularity: body?.popularity ?? null,
      voteCount: body?.vote_count ?? null,
      originalLanguage: body?.original_language ?? null,
      budget: body?.budget ?? null,
      revenue: body?.revenue ?? null,
      lastAirDate: body?.last_air_date ?? null,
      nextAirDate: body?.next_episode_to_air?.air_date ?? null,
      createdBy: extractNames(body?.created_by),
      networks: extractNames(body?.networks),
      productionCompanies: extractNames(body?.production_companies),
      productionCountries: extractNames(body?.production_countries),
      spokenLanguages: (body?.spoken_languages ?? [])
        .map((item) => item.english_name ?? item.name)
        .filter(Boolean) as string[],
      originCountries: body?.origin_country ?? [],
      seasonsList: (body?.seasons ?? []).map((season) => ({
        name: season.name ?? 'Season',
        episodeCount: season.episode_count ?? null,
        seasonNumber: season.season_number ?? null,
        airDate: season.air_date ?? null,
        overview: season.overview ?? '',
      })),
      genres: body?.genres ?? [],
      cast,
      crew: (body?.credits?.crew ?? [])
        .slice(0, 16)
        .map((entry) => ({
          name: entry.name ?? 'Unknown',
          job: entry.job ?? 'Crew',
        })),
      raw: body as Record<string, unknown>,
    },
  };
}
