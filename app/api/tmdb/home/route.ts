import { NextResponse } from 'next/server';
import type { WatchWiseMediaItem, WatchWiseSection } from '@/lib/watchwise';
import {
  logApiRequest,
  logApiResponse,
  logExternalRequest,
  logExternalResponse,
} from '@/lib/api-logging';

type TmdbResponseItem = {
  id: number;
  media_type?: 'movie' | 'tv';
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string | null;
  first_air_date?: string | null;
  genre_ids?: number[];
};

type TmdbListResponse = {
  results?: TmdbResponseItem[];
};

type TmdbMovieDetails = TmdbResponseItem & {
  runtime?: number | null;
  status?: string;
  tagline?: string;
  genres?: Array<{ id: number; name: string }>;
  images?: {
    posters?: Array<{
      file_path?: string | null;
      vote_average?: number;
      iso_639_1?: string | null;
    }>;
    backdrops?: Array<{
      file_path?: string | null;
      vote_average?: number;
      iso_639_1?: string | null;
    }>;
  };
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function fetchTmdb<T>(path: string): Promise<T> {
  const apiKey = requireEnv('TMDB_API_KEY');
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'en-US');

  logExternalRequest('tmdb', {
    url: url.toString(),
    method: 'GET',
  });

  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    logExternalResponse('tmdb', {
      status: response.status,
      body: { path, ok: false },
      durationMs: Date.now() - startedAt,
    });
    throw new Error(`TMDB request failed for ${path}: ${response.status}`);
  }

  const data = (await response.json()) as T;
  logExternalResponse('tmdb', {
    status: response.status,
    body: {
      path,
      ok: true,
      results: Array.isArray((data as { results?: unknown[] }).results)
        ? (data as { results?: unknown[] }).results?.length ?? 0
        : undefined,
    },
    durationMs: Date.now() - startedAt,
  });
  return data;
}

async function fetchTmdbMovieDetails(id: number): Promise<TmdbMovieDetails> {
  const details = await fetchTmdb<TmdbMovieDetails>(
    `/movie/${id}?append_to_response=images`,
  );
  return details;
}

function toMediaItem(
  item: TmdbResponseItem,
  mediaType: 'movie' | 'tv',
): WatchWiseMediaItem {
  return {
    id: item.id,
    mediaType,
    title: item.title ?? item.name ?? 'Untitled',
    overview: item.overview ?? '',
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    voteAverage: item.vote_average ?? 0,
    releaseDate: item.release_date ?? null,
    firstAirDate: item.first_air_date ?? null,
    genreIds: item.genre_ids ?? [],
  };
}

function mapItems(
  results: TmdbResponseItem[] | undefined,
  mediaType: 'movie' | 'tv',
) {
  return (results ?? [])
    .slice(0, 12)
    .map((item) => toMediaItem(item, mediaType));
}

async function hydrateMovieItems(
  results: TmdbResponseItem[] | undefined,
  limit = 12,
) {
  const selected = (results ?? []).slice(0, limit);

  const hydrated = await Promise.allSettled(
    selected.map(async (item) => {
      const details = await fetchTmdbMovieDetails(item.id);
      const detailPoster =
        details.poster_path ??
        details.images?.posters?.find(
          (poster) => Boolean(poster.file_path),
        )?.file_path ??
        null;
      const detailBackdrop =
        details.backdrop_path ??
        details.images?.backdrops?.find(
          (backdrop) => Boolean(backdrop.file_path),
        )?.file_path ??
        null;

      return toMediaItem(
        {
          ...item,
          poster_path: detailPoster ?? item.poster_path ?? null,
          backdrop_path: detailBackdrop ?? item.backdrop_path ?? null,
          overview: details.overview ?? item.overview ?? '',
          vote_average: details.vote_average ?? item.vote_average ?? 0,
          release_date: details.release_date ?? item.release_date ?? null,
        },
        'movie',
      );
    }),
  );

  return hydrated.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
}

function fallbackSections(): WatchWiseSection[] {
  const fallback = {
    trendingNow: [
      { id: 872585, mediaType: 'movie' as const, title: 'Oppenheimer' },
      { id: 569094, mediaType: 'movie' as const, title: 'Spider-Man: Across the Spider-Verse' },
      { id: 157336, mediaType: 'movie' as const, title: 'Interstellar' },
      { id: 15765, mediaType: 'tv' as const, title: 'Peaky Blinders' },
    ],
    popularMovies: [
      { id: 346364, mediaType: 'movie' as const, title: 'It' },
      { id: 19995, mediaType: 'movie' as const, title: 'Avatar' },
      { id: 155, mediaType: 'movie' as const, title: 'The Dark Knight' },
      { id: 123, mediaType: 'movie' as const, title: 'The Lord of the Rings' },
    ],
    popularShows: [
      { id: 1399, mediaType: 'tv' as const, title: 'Game of Thrones' },
      { id: 66732, mediaType: 'tv' as const, title: 'Stranger Things' },
      { id: 48891, mediaType: 'tv' as const, title: 'The Boys' },
      { id: 94605, mediaType: 'tv' as const, title: 'Wednesday' },
    ],
    topRated: [
      { id: 278, mediaType: 'movie' as const, title: 'The Shawshank Redemption' },
      { id: 238, mediaType: 'movie' as const, title: 'The Godfather' },
      { id: 680, mediaType: 'movie' as const, title: 'Pulp Fiction' },
      { id: 424, mediaType: 'movie' as const, title: 'Schindler\'s List' },
    ],
    horror: [
      { id: 694, mediaType: 'movie' as const, title: 'The Conjuring' },
      { id: 4232, mediaType: 'movie' as const, title: 'Scream' },
      { id: 1091, mediaType: 'movie' as const, title: 'It Follows' },
      { id: 420818, mediaType: 'movie' as const, title: 'The Black Phone' },
    ],
    feelGood: [
      { id: 106646, mediaType: 'movie' as const, title: 'The Intouchables' },
      { id: 77, mediaType: 'movie' as const, title: 'Good Will Hunting' },
      { id: 496243, mediaType: 'movie' as const, title: 'Parasite' },
      { id: 508943, mediaType: 'movie' as const, title: 'Luca' },
    ],
    action: [
      { id: 299536, mediaType: 'movie' as const, title: 'Avengers: Infinity War' },
      { id: 299534, mediaType: 'movie' as const, title: 'Avengers: Endgame' },
      { id: 603692, mediaType: 'movie' as const, title: 'John Wick: Chapter 4' },
      { id: 27205, mediaType: 'movie' as const, title: 'Inception' },
    ],
    romance: [
      { id: 313369, mediaType: 'movie' as const, title: 'La La Land' },
      { id: 19404, mediaType: 'movie' as const, title: 'Dilwale Dulhania Le Jayenge' },
      { id: 414906, mediaType: 'movie' as const, title: 'The Hate U Give' },
      { id: 872, mediaType: 'movie' as const, title: 'Casablanca' },
    ],
    mystery: [
      { id: 807, mediaType: 'movie' as const, title: 'Se7en' },
      { id: 500, mediaType: 'movie' as const, title: 'Reservoir Dogs' },
      { id: 550, mediaType: 'movie' as const, title: 'Fight Club' },
      { id: 1090, mediaType: 'movie' as const, title: 'The Silence of the Lambs' },
    ],
  };

  const toItem = (entry: { id: number; mediaType: 'movie' | 'tv'; title: string }): WatchWiseMediaItem => ({
    id: entry.id,
    mediaType: entry.mediaType,
    title: entry.title,
    overview:
      'TMDB is temporarily unavailable, so this title is being served from the offline WatchWise fallback catalog.',
    posterPath: null,
    backdropPath: null,
    voteAverage: 0,
    releaseDate: null,
    firstAirDate: null,
    genreIds: [],
  });

  return [
    {
      id: 'trending-now',
      title: 'Trending Now',
      subtitle: 'Offline fallback catalog',
      items: fallback.trendingNow.map(toItem),
    },
    {
      id: 'popular-movies',
      title: 'Popular Movies',
      subtitle: 'Offline fallback catalog',
      items: fallback.popularMovies.map(toItem),
    },
    {
      id: 'popular-shows',
      title: 'Popular TV Shows',
      subtitle: 'Offline fallback catalog',
      items: fallback.popularShows.map(toItem),
    },
    {
      id: 'top-rated',
      title: 'Top Rated',
      subtitle: 'Offline fallback catalog',
      items: fallback.topRated.map(toItem),
    },
    {
      id: 'horror-night',
      title: 'Horror Night',
      subtitle: 'Offline fallback catalog',
      items: fallback.horror.map(toItem),
    },
    {
      id: 'feel-good',
      title: 'Feel-Good Watchlist',
      subtitle: 'Offline fallback catalog',
      items: fallback.feelGood.map(toItem),
    },
    {
      id: 'action-adventure',
      title: 'Action Rush',
      subtitle: 'Offline fallback catalog',
      items: fallback.action.map(toItem),
    },
    {
      id: 'romance-night',
      title: 'Romance Night',
      subtitle: 'Offline fallback catalog',
      items: fallback.romance.map(toItem),
    },
    {
      id: 'mystery-thriller',
      title: 'Mystery & Thrillers',
      subtitle: 'Offline fallback catalog',
      items: fallback.mystery.map(toItem),
    },
  ];
}

export async function GET() {
  const startedAt = Date.now();
  try {
    logApiRequest('/api/tmdb/home', {
      method: 'GET',
    });
    const [
      trendingMovies,
      trendingTv,
      popularMovies,
      upcomingMovies,
      popularTv,
      topRatedMovies,
      horrorMovies,
      feelGoodMovies,
      actionMovies,
      romanceMovies,
      mysteryMovies,
    ] = await Promise.all(
      [
        fetchTmdb<TmdbListResponse>('/trending/movie/week'),
        fetchTmdb<TmdbListResponse>('/trending/tv/week'),
        fetchTmdb<TmdbListResponse>('/movie/popular'),
        fetchTmdb<TmdbListResponse>('/movie/upcoming'),
        fetchTmdb<TmdbListResponse>('/tv/popular'),
        fetchTmdb<TmdbListResponse>('/movie/top_rated'),
        fetchTmdb<TmdbListResponse>('/discover/movie?with_genres=27'),
        fetchTmdb<TmdbListResponse>('/discover/movie?with_genres=35,16,12'),
        fetchTmdb<TmdbListResponse>('/discover/movie?with_genres=28,12,878'),
        fetchTmdb<TmdbListResponse>('/discover/movie?with_genres=10749,18'),
        fetchTmdb<TmdbListResponse>('/discover/movie?with_genres=9648,53'),
      ].map(async (promise) => {
        try {
          return await promise;
        } catch (error) {
          console.warn('[api] /api/tmdb/home endpoint failed but continuing', error);
          return { results: [] } as TmdbListResponse;
        }
      }),
    );

    const sections: WatchWiseSection[] = [
      {
        id: 'trending-now',
        title: 'Trending Now',
        subtitle: 'The most watched titles this week',
        items: [
          ...mapItems(trendingMovies.results, 'movie'),
          ...mapItems(trendingTv.results, 'tv'),
        ].slice(0, 12),
      },
      {
        id: 'popular-movies',
        title: 'Popular Movies',
        subtitle: 'High momentum movies from TMDB',
        items: await hydrateMovieItems(popularMovies.results),
      },
      {
        id: 'upcoming-movies',
        title: 'Upcoming Movies',
        subtitle: 'Fresh releases coming soon',
        items: await hydrateMovieItems(upcomingMovies.results),
      },
      {
        id: 'popular-shows',
        title: 'Popular TV Shows',
        subtitle: 'Shows people are bingeing right now',
        items: mapItems(popularTv.results, 'tv'),
      },
      {
        id: 'top-rated',
        title: 'Top Rated',
        subtitle: 'Critically loved picks',
        items: await hydrateMovieItems(topRatedMovies.results),
      },
      {
        id: 'horror-night',
        title: 'Horror Night',
        subtitle: 'For scary, suspenseful vibes',
        items: await hydrateMovieItems(horrorMovies.results),
      },
      {
        id: 'feel-good',
        title: 'Feel-Good Watchlist',
        subtitle: 'Light, funny, and uplifting picks',
        items: await hydrateMovieItems(feelGoodMovies.results),
      },
      {
        id: 'action-adventure',
        title: 'Action Rush',
        subtitle: 'Fast, high-energy picks',
        items: await hydrateMovieItems(actionMovies.results),
      },
      {
        id: 'romance-night',
        title: 'Romance Night',
        subtitle: 'For date night and heartfelt stories',
        items: await hydrateMovieItems(romanceMovies.results),
      },
      {
        id: 'mystery-thriller',
        title: 'Mystery & Thrillers',
        subtitle: 'Suspense, puzzles, and twists',
        items: await hydrateMovieItems(mysteryMovies.results),
      },
    ];

    const featured = sections.find((section) => section.items.length > 0)?.items[0] ?? null;

    const payload = {
      featured,
      sections,
      source: 'tmdb',
      generatedAt: new Date().toISOString(),
    };
    logApiResponse('/api/tmdb/home', {
      status: 200,
      body: {
        source: payload.source,
        sections: payload.sections.length,
      },
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('TMDB home API failed:', error);
    const sections = fallbackSections();
    const featured = sections.find((section) => section.items.length > 0)?.items[0] ?? null;
    const payload = {
      featured,
      sections,
      source: 'fallback',
      warning:
        error instanceof Error
          ? error.message
          : 'Failed to load TMDB catalog',
    };
    logApiResponse('/api/tmdb/home', {
      status: 200,
      body: {
        source: payload.source,
        sections: payload.sections.length,
        warning: payload.warning,
      },
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload);
  }
}
