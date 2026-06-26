import { NextRequest, NextResponse } from 'next/server';
import {
  detectMood,
  flattenSections,
  pickMoodSection,
  type WatchWiseMediaItem,
  type WatchWiseSection,
} from '@/lib/watchwise';
import { logApiRequest, logApiResponse } from '@/lib/api-logging';

type WatchWiseHomeResponse = {
  featured: WatchWiseMediaItem | null;
  sections: WatchWiseSection[];
  source?: string;
};

type WatchWiseRecommendationBody = {
  query?: string;
  transcriptText?: string;
  latestUserText?: string;
  latestAssistantText?: string;
};

function chooseDefaultSection(query: string, sections: WatchWiseSection[]) {
  const normalized = query.toLowerCase();
  const byId = new Map(sections.map((section) => [section.id, section]));

  if (normalized.includes('show') || normalized.includes('series')) {
    return byId.get('popular-shows') ?? sections[0] ?? null;
  }

  if (normalized.includes('movie') || normalized.includes('film')) {
    return byId.get('popular-movies') ?? sections[0] ?? null;
  }

  if (normalized.includes('latest') || normalized.includes('new')) {
    return (
      byId.get('upcoming-movies') ??
      byId.get('trending-now') ??
      sections[0] ??
      null
    );
  }

  return sections[0] ?? null;
}

function summarizeTitles(items: WatchWiseMediaItem[]) {
  return items.slice(0, 6).map((item) => item.title).join(', ');
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let body: WatchWiseRecommendationBody = {};

  try {
    body = (await request.json()) as WatchWiseRecommendationBody;
  } catch {}

  const query = [
    body.query,
    body.transcriptText,
    body.latestUserText,
    body.latestAssistantText,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  logApiRequest('/api/watchwise/recommendations', {
    method: 'POST',
    body: {
      queryLength: query.length,
      hasTranscript: Boolean(body.transcriptText),
      hasLatestUserText: Boolean(body.latestUserText),
    },
  });

  try {
    const homeUrl = new URL('/api/tmdb/home', request.url);
    const homeResponse = await fetch(homeUrl, {
      cache: 'no-store',
    });

    if (!homeResponse.ok) {
      throw new Error(`TMDB home fetch failed: ${homeResponse.status}`);
    }

    const homeData = (await homeResponse.json()) as WatchWiseHomeResponse;
    const sections = homeData.sections ?? [];
    const mood = detectMood(query);

    const moodSection = mood ? pickMoodSection(mood, sections) : null;
    const fallbackSection = chooseDefaultSection(query, sections);
    const selectedSection = moodSection ?? fallbackSection;
    const items =
      selectedSection?.items?.length
        ? selectedSection.items.slice(0, 12)
        : flattenSections(sections).slice(0, 12);

    const reply = mood
      ? `For a ${mood.label.toLowerCase()} mood, I found exact TMDB picks like ${summarizeTitles(items)}.`
      : `I found these TMDB picks for your request: ${summarizeTitles(items)}.`;

    const payload = {
      reply,
      query,
      mood: mood?.label ?? null,
      railTitle: selectedSection?.title ?? 'WatchWise picks',
      railSubtitle:
        selectedSection?.subtitle ??
        'Curated live from the TMDB catalog used by WatchWise',
      items,
      source: 'tmdb',
      generatedAt: new Date().toISOString(),
    };

    logApiResponse('/api/watchwise/recommendations', {
      status: 200,
      body: {
        source: payload.source,
        itemCount: payload.items.length,
        mood: payload.mood,
      },
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const payload = {
      reply:
        'I could not load live TMDB recommendations right now, but the main catalog is still available on the page.',
      query,
      mood: null,
      railTitle: 'WatchWise picks',
      railSubtitle: 'Live recommendations unavailable',
      items: [],
      source: 'fallback',
      warning: error instanceof Error ? error.message : 'Recommendation lookup failed',
    };

    logApiResponse('/api/watchwise/recommendations', {
      status: 200,
      body: {
        source: payload.source,
        itemCount: payload.items.length,
        warning: payload.warning,
      },
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(payload);
  }
}
