type Loggable = unknown;

const REDACT_KEYS = new Set([
  'token',
  'appCertificate',
  'apiKey',
  'authorization',
  'password',
  'secret',
  'NEXT_AGORA_APP_CERTIFICATE',
  'NEXT_LLM_API_KEY',
  'NEXT_DEEPGRAM_API_KEY',
  'NEXT_ELEVENLABS_API_KEY',
  'TMDB_API_KEY',
]);

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 140 ? `${value.slice(0, 140)}…` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        REDACT_KEYS.has(key) ? '[REDACTED]' : redactValue(entry),
      ]),
    );
  }

  return value;
}

export function safeLogValue(value: Loggable) {
  return redactValue(value);
}

export function logApiRequest(route: string, request: {
  method?: string;
  url?: string;
  body?: Loggable;
  query?: Record<string, string | null | undefined>;
}) {
  console.log(`[api] ${route} request`, safeLogValue(request));
}

export function logApiResponse(route: string, response: {
  status: number;
  body?: Loggable;
  durationMs?: number;
}) {
  console.log(`[api] ${route} response`, safeLogValue(response));
}

export function logExternalRequest(target: string, details: {
  url: string;
  method?: string;
  body?: Loggable;
}) {
  console.log(`[api-external] ${target} request`, safeLogValue(details));
}

export function logExternalResponse(target: string, details: {
  status: number;
  body?: Loggable;
  durationMs?: number;
}) {
  console.log(`[api-external] ${target} response`, safeLogValue(details));
}
