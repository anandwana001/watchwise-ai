export type WatchWiseMediaType = 'movie' | 'tv';

export type WatchWiseMediaItem = {
  id: number;
  mediaType: WatchWiseMediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  releaseDate: string | null;
  firstAirDate: string | null;
  genreIds: number[];
};

export type WatchWiseSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: WatchWiseMediaItem[];
};

function uniqueById(items: WatchWiseMediaItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function getTmdbPosterUrl(path: string | null, size = 'w500') {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

export function getTmdbBackdropUrl(path: string | null, size = 'w780') {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

export function detectMood(text: string) {
  const normalized = text.toLowerCase();

  const moods = [
    {
      id: 'horror',
      label: 'Horror',
      keywords: ['horror', 'scary', 'creepy', 'spooky', 'terrified', 'jump scare'],
    },
    {
      id: 'happy',
      label: 'Feel-good',
      keywords: ['happy', 'feel good', 'feel-good', 'uplifting', 'bright', 'fun'],
    },
    {
      id: 'romance',
      label: 'Romance',
      keywords: ['romantic', 'romance', 'date night', 'love', 'sweet'],
    },
    {
      id: 'action',
      label: 'Action',
      keywords: ['action', 'exciting', 'thrill', 'adventure', 'fast'],
    },
    {
      id: 'mystery',
      label: 'Mystery',
      keywords: ['mystery', 'suspense', 'detective', 'crime', 'twist'],
    },
    {
      id: 'family',
      label: 'Family',
      keywords: ['family', 'kids', 'children', 'animated', 'cartoon'],
    },
    {
      id: 'comedy',
      label: 'Comedy',
      keywords: ['comedy', 'funny', 'laugh', 'lighthearted', 'silly'],
    },
    {
      id: 'drama',
      label: 'Drama',
      keywords: ['drama', 'serious', 'emotional', 'heartfelt'],
    },
  ];

  for (const mood of moods) {
    if (mood.keywords.some((keyword) => normalized.includes(keyword))) {
      return mood;
    }
  }

  return null;
}

export function extractLeadingText(text: string, maxLength = 160) {
  const stripped = text.replace(/\s+/g, ' ').trim();
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength).trim()}…`;
}

export function buildMoodKeywords() {
  return [
    'horror',
    'scary',
    'happy',
    'feel good',
    'romantic',
    'action',
    'mystery',
    'family',
    'comedy',
    'drama',
    'thriller',
    'adventure',
  ];
}

export function pickMoodSection(
  mood: NonNullable<ReturnType<typeof detectMood>>,
  sections: WatchWiseSection[],
) {
  const byId = new Map(sections.map((section) => [section.id, section]));

  const moodMap: Record<string, string[]> = {
    horror: ['horror-night', 'mystery-thriller', 'trending-now'],
    happy: ['feel-good', 'popular-shows', 'popular-movies'],
    romance: ['romance-night', 'top-rated'],
    action: ['action-adventure', 'trending-now', 'popular-movies'],
    mystery: ['mystery-thriller', 'top-rated', 'trending-now'],
    family: ['feel-good', 'popular-shows'],
    comedy: ['feel-good', 'popular-movies', 'popular-shows'],
    drama: ['top-rated', 'romance-night'],
  };

  const orderedItems = uniqueById(
    (moodMap[mood.id] ?? [])
      .flatMap((sectionId) => byId.get(sectionId)?.items ?? [])
      .slice(0, 12),
  );

  if (orderedItems.length === 0) {
    return null;
  }

  return {
    id: `mood-${mood.id}`,
    title: `Picked for your ${mood.label.toLowerCase()} mood`,
    subtitle: 'Based on what you said to WatchWise',
    items: orderedItems,
  } satisfies WatchWiseSection;
}

export function flattenSections(sections: WatchWiseSection[]) {
  return uniqueById(sections.flatMap((section) => section.items));
}
