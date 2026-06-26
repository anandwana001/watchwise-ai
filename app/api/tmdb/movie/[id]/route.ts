import { NextResponse } from 'next/server';
import { logApiRequest, logApiResponse, logExternalRequest, logExternalResponse } from '@/lib/api-logging';
import type { WatchWiseMediaItem } from '@/lib/watchwise';

type MovieDetails = {
  id: number;
  title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string | null;
  genre_ids?: number[];
  runtime?: number | null;
  genres?: Array<{ id: number; name: string }>;
  status?: string;
  tagline?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toMediaItem(movie: MovieDetails): WatchWiseMediaItem {
  return {
    id: movie.id,
    mediaType: 'movie',
    title: movie.title ?? 'Untitled',
    overview: movie.overview ?? '',
    posterPath: movie.poster_path ?? null,
    backdropPath: movie.backdrop_path ?? null,
    voteAverage: movie.vote_average ?? 0,
    releaseDate: movie.release_date ?? null,
    firstAirDate: null,
    genreIds: movie.genre_ids ?? [],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();

  try {
    const { id } = await params;
    logApiRequest('/api/tmdb/movie/[id]', {
      method: 'GET',
      query: { id },
    });

    const apiKey = requireEnv('TMDB_API_KEY');
    const url = new URL(`https://api.themoviedb.org/3/movie/${id}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'en-US');
    url.searchParams.set('append_to_response', 'videos,credits');

    logExternalRequest('tmdb', {
      url: url.toString(),
      method: 'GET',
    });

    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    const body = await response.json();
    logExternalResponse('tmdb', {
      status: response.status,
      body: {
        ok: response.ok,
        id,
        posterPath: body?.poster_path ?? null,
        backdropPath: body?.backdrop_path ?? null,
      },
      durationMs: Date.now() - startedAt,
    });

    if (!response.ok) {
      const payload = {
        error: `TMDB movie details request failed: ${response.status}`,
      };
      logApiResponse('/api/tmdb/movie/[id]', {
        status: response.status,
        body: payload,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(payload, { status: response.status });
    }

    const payload = {
      movie: toMediaItem(body as MovieDetails),
      details: {
        runtime: body?.runtime ?? null,
        status: body?.status ?? null,
        tagline: body?.tagline ?? null,
        genres: body?.genres ?? [],
      },
    };

    logApiResponse('/api/tmdb/movie/[id]', {
      status: 200,
      body: {
        id,
        title: payload.movie.title,
        posterPath: payload.movie.posterPath,
      },
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const payload = {
      error: error instanceof Error ? error.message : 'Failed to load movie details',
    };
    logApiResponse('/api/tmdb/movie/[id]', {
      status: 500,
      body: payload,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload, { status: 500 });
  }
}
