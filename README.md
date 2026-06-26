# WatchWise AI: Voice-Powered OTT Discovery

[![Build](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs/actions/workflows/build-check.yml/badge.svg)](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs/actions/workflows/build-check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

WatchWise AI is a premium OTT discovery demo built with Next.js, TMDB, and the Agora Conversational AI Engine.

It shows how a streaming platform can let viewers:
- speak naturally about mood, genre, language, or vibe
- get instant, clickable rows of movies and TV shows
- open a title detail page inside the same app
- ask Agora questions about cast, summary, season info, or similar titles
- move from search to recommendation to playback intent in one conversational flow

This is designed to help OTT companies see how Agora can power a higher-converting, lower-friction discovery experience.

## Why OTT Teams Care

Traditional OTT navigation usually forces users through search bars, category rails, and endless scrolling. WatchWise AI turns that into a conversation.

With Agora, you can add:
- voice-first discovery
- natural-language recommendations
- contextual follow-up questions
- title-specific conversations on detail pages
- real-time voice assistant UX in the browser

For product teams, this demo is a blueprint for:
- reducing search friction
- increasing engagement with recommendations
- improving content discovery on large catalogs
- making a streaming app feel more premium and interactive

## Demo Highlights

- Netflix-style OTT UI with a custom WatchWise visual design
- TMDB-powered rails for trending, popular, upcoming, horror, romance, action, and more
- internal detail pages for movies and TV shows
- title-specific Agora assistant on every detail page
- live transcript, agent state, and pipeline latency
- right-side assistant drawer that feels like a premium OTT companion

## Prerequisites

- [Node.js 22+](https://nodejs.org/en/download/)
- [pnpm](https://pnpm.io/installation)
- [Agora CLI](https://github.com/AgoraIO-Community/cli)
- A [TMDB developer API key](https://developer.themoviedb.org/docs/getting-started)

## Quick Start

1. Install the Agora CLI and sign in if needed:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/AgoraIO/cli/main/install.sh | sh -s -- --add-to-path
   agora login
   ```

2. Run the app:

   ```bash
   pnpm install
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

4. Click **Agora** on the home page or open any title card to start a title-specific voice conversation.

## What You Can Demo

- “Show me horror movies”
- “I want something happy”
- “Give me a date-night movie”
- “Find me TV shows like this”
- “Who’s in the cast?”
- “What’s the summary?”
- “Show me similar titles”

## Environment Variables

Defined in [`env.local.example`](env.local.example).

| Variable                     | Required | Default  | Notes                                                                                          |
| ---------------------------- | :------: | :------: | ---------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_AGORA_APP_ID`   |    ✅    |    —     | Agora Console → Project → App ID.                                                              |
| `NEXT_AGORA_APP_CERTIFICATE` |    ✅    |    —     | Agora Console → Project → App Certificate. **Server-side only.**                               |
| `NEXT_PUBLIC_AGENT_UID`      |          | `123456` | Must match the `agentUid` in [`app/api/invite-agent/route.ts`](app/api/invite-agent/route.ts). |
| `NEXT_AGENT_GREETING`        |          |    —     | Override the agent opening line.                                                               |
| `TMDB_API_KEY`               |    ✅    |    —     | TMDB developer API key for catalog and detail pages.                                           |

## Where to Put the Keys

- Put your Agora App ID in `NEXT_PUBLIC_AGORA_APP_ID`
- Put your Agora App Certificate in `NEXT_AGORA_APP_CERTIFICATE`
- Put your TMDB API key in `TMDB_API_KEY`

If you are using the default demo mode, no extra vendor keys are needed for the Agora-managed STT, LLM, and TTS pipeline.

## Run It with Agora

If you want the full Agora project flow:

```bash
agora login
agora project use <your-project>
agora project env write .env.local
pnpm install
pnpm dev
```

If the agent does not join or transcripts do not appear, run:

```bash
agora project doctor --deep
```

## How It Works

1. The browser requests an RTC + RTM token from `/api/generate-agora-token`.
2. The backend starts an Agora Conversational AI agent in `/api/invite-agent`.
3. TMDB powers the catalog, home rails, and detail pages.
4. Users click a title card to open an internal detail page.
5. The detail page starts a title-specific Agora assistant that can answer questions about that exact movie or show.
6. On end, the client calls `/api/stop-conversation`, logs out RTM, and cleans up the call view.

## What You Get

- browser voice client built with Next.js App Router
- RTC audio plus RTM transcript and state events
- server routes for token generation, invite, and stop
- TMDB-powered OTT home rails and title pages
- title-specific detail pages with rich metadata
- live transcript and real-time pipeline latency
- Agora-managed default STT, LLM, and TTS configuration

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./system-architecture-dark.svg">
  <img src="./system-architecture.svg" alt="System architecture">
</picture>

The browser fetches an RTC + RTM token from this app, joins the channel using a single RTC client, and uses RTM as the data channel for transcript, agent state, metrics, and error events. The Conversational AI Engine joins the same channel as the configured `NEXT_PUBLIC_AGENT_UID`.

For OTT discovery, TMDB provides the content rails and the detail pages, while Agora powers the live conversational layer that helps viewers decide what to watch.

## Commands

```bash
# Dev
pnpm dev

# Quality
pnpm run lint
pnpm run typecheck
pnpm run doctor

# CI / pre-ship
pnpm run verify:api
pnpm run build
pnpm run verify
```

Run `pnpm run verify` before shipping changes. It covers local prerequisites, lint, type safety, the core API route contracts, and the production build.

## Repo Map

- `app/page.tsx` — home page entry
- `app/title/[mediaType]/[id]/page.tsx` — title detail page entry
- `app/api/generate-agora-token/route.ts` — issues RTC + RTM tokens
- `app/api/invite-agent/route.ts` — starts the Agora agent session
- `app/api/stop-conversation/route.ts` — stops the agent session
- `app/api/tmdb/home/route.ts` — TMDB home catalog rails
- `app/api/tmdb/title/[mediaType]/[id]/route.ts` — TMDB title details
- `components/LandingPage.tsx` — OTT home experience
- `components/TitleDetailPage.tsx` — title detail page with Agora drawer
- `components/ConversationComponent.tsx` — RTC client, transcript state, mic controls
- `components/QuickstartConversationLayout.tsx` — in-call layout
- `components/QuickstartPipelineMetrics.tsx` — pipeline latency chips
- `components/QuickstartTranscriptPanel.tsx` — live transcript rail
- `lib/tmdb-title.ts` — shared title fetch helper
- `lib/watchwise.ts` — TMDB item helpers and mood detection

## Troubleshooting

- **Agent does not join or transcripts are missing:** run `agora project doctor --deep`.
- **TMDB rows are empty:** verify `TMDB_API_KEY` is set.
- **Voice assistant does not start:** verify `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE`.
- **Title detail page looks incomplete:** confirm the TMDB API key is valid and that the selected title exists in TMDB.

## More Docs

- [docs/ai/L0_repo_card.md](./docs/ai/L0_repo_card.md)
- [docs/ai/RECIPE.md](./docs/ai/RECIPE.md)
- [AGENTS.md](./AGENTS.md)

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and conventions.

## Security

Please do **not** open public issues for security reports. Email security@agora.io with details and reproduction steps.

## License

Released under the [MIT License](./LICENSE).
