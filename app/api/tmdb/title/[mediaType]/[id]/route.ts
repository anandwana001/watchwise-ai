import { NextResponse } from 'next/server';
import { fetchTitleDetails } from '@/lib/tmdb-title';
import { logApiRequest, logApiResponse } from '@/lib/api-logging';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaType: string; id: string }> },
) {
  const startedAt = Date.now();

  try {
    const { mediaType, id } = await params;
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      const payload = { error: 'mediaType must be movie or tv' };
      logApiResponse('/api/tmdb/title/[mediaType]/[id]', {
        status: 400,
        body: payload,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(payload, { status: 400 });
    }

    logApiRequest('/api/tmdb/title/[mediaType]/[id]', {
      method: 'GET',
      query: { mediaType, id },
    });

    const payload = await fetchTitleDetails(mediaType, id);

    logApiResponse('/api/tmdb/title/[mediaType]/[id]', {
      status: 200,
      body: {
        mediaType,
        id,
        title: payload.media.title,
        posterPath: payload.media.posterPath,
        cast: payload.details.cast.slice(0, 5),
      },
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const payload = {
      error: error instanceof Error ? error.message : 'Failed to load title details',
    };

    logApiResponse('/api/tmdb/title/[mediaType]/[id]', {
      status: 500,
      body: payload,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(payload, { status: 500 });
  }
}
