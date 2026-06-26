import { NextRequest, NextResponse } from 'next/server';
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
} from 'agora-agents';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';
import { logApiRequest, logApiResponse } from '@/lib/api-logging';

// First thing the agent says when a user joins the channel.
// Set NEXT_AGENT_GREETING in .env.local to override.
const GREETING =
  process.env.NEXT_AGENT_GREETING ??
  `Hi, I'm WatchWise AI. Tell me your mood and I’ll help you find the perfect movie or show.`;

// agentUid identifies the AI in the RTC channel — must match NEXT_PUBLIC_AGENT_UID on the client
const agentUid = process.env.NEXT_PUBLIC_AGENT_UID ?? String(DEFAULT_AGENT_UID);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function buildWatchwisePrompt(requestUrl: string) {
  const basePrompt = `You are **WatchWise AI**, a warm and concise voice assistant for an OTT discovery demo powered by Agora.

Your job is to help the user find something to watch from the exact titles available in the WatchWise TMDB catalog.

Rules:
- Keep responses short and conversational.
- If the user gives a mood, genre, or vibe, answer with exact movie or TV show titles from the current catalog.
- Tell the user the matching rail or section name when possible.
- Do not invent titles that are not in the app catalog.
- If you are unsure, ask one short clarifying question.
- Always prefer specific titles over category-only replies.

Tone:
- Friendly, cinematic, and helpful.
- Speak like a movie concierge, not a support agent.`;

  try {
    const catalogResponse = await fetch(new URL('/api/tmdb/home', requestUrl), {
      cache: 'no-store',
    });
    if (!catalogResponse.ok) {
      return basePrompt;
    }

    const catalogData = (await catalogResponse.json()) as {
      sections?: Array<{
        title: string;
        subtitle?: string;
        items?: Array<{ title: string }>;
      }>;
    };

    const catalogSummary =
      catalogData.sections
        ?.slice(0, 6)
        .map((section) => {
          const titles = (section.items ?? [])
            .slice(0, 4)
            .map((item) => item.title)
            .join(', ');
          return `- ${section.title}: ${titles}`;
        })
        .join('\n') ?? '';

    return `${basePrompt}\n\nCurrent TMDB catalog snapshot:\n${catalogSummary}\n\nWhen replying, use these exact titles if they match the user's mood.`;
  } catch {
    return basePrompt;
  }
}

function formatContext(context?: ClientStartRequest['context']) {
  if (!context) return '';

  const parts = [
    context.title ? `Title: ${context.title}` : null,
    context.mediaType ? `Type: ${context.mediaType}` : null,
    context.tagline ? `Tagline: ${context.tagline}` : null,
    context.runtime ? `Runtime: ${context.runtime} minutes` : null,
    context.seasons ? `Seasons: ${context.seasons}` : null,
    context.genres?.length ? `Genres: ${context.genres.join(', ')}` : null,
    context.cast?.length ? `Cast: ${context.cast.slice(0, 12).join(', ')}` : null,
    context.crew?.length ? `Crew: ${context.crew.slice(0, 12).join(', ')}` : null,
    context.overview ? `Overview: ${context.overview}` : null,
    context.status ? `Status: ${context.status}` : null,
    context.homepage ? `Homepage: ${context.homepage}` : null,
    context.imdbId ? `IMDb: ${context.imdbId}` : null,
    context.productionCompanies?.length
      ? `Production Companies: ${context.productionCompanies.join(', ')}`
      : null,
    context.productionCountries?.length
      ? `Production Countries: ${context.productionCountries.join(', ')}`
      : null,
    context.spokenLanguages?.length
      ? `Spoken Languages: ${context.spokenLanguages.join(', ')}`
      : null,
    context.networks?.length ? `Networks: ${context.networks.join(', ')}` : null,
    context.createdBy?.length ? `Created By: ${context.createdBy.join(', ')}` : null,
  ].filter(Boolean);

  return parts.length ? `\n\nSelected title context:\n${parts.join('\n')}` : '';
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    // --- 1. Parse request ---

    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name, context } = body;

    logApiRequest('/api/invite-agent', {
      method: 'POST',
      url: request.url,
      body,
    });

    // Validate required env vars on first request so misconfiguration surfaces
    // with a clear error message rather than a silent failure.
    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');
    const watchwisePrompt = `${await buildWatchwisePrompt(request.url)}${formatContext(context)}`;

    if (!channel_name || !requester_id) {
      const payload = { error: 'channel_name and requester_id are required' };
      logApiResponse('/api/invite-agent', {
        status: 400,
        body: payload,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(payload, { status: 400 });
    }

    // --- 2. Build and start the agent ---

    // AgoraClient authenticates API calls to the Agora Conversational AI service.
    // area: change to Area.EU or Area.AP for European or Asia-Pacific deployments.
    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    // Pipeline: Deepgram (reseller) STT → OpenAI (reseller) LLM → MiniMax (reseller) TTS.
    // Omit vendor API keys for supported models — AgentKit infers reseller presets on start (see Agora Console / billing).
    const agent = new Agent({
      client,
      instructions: watchwisePrompt,
      greeting: GREETING,
      failureMessage: 'Please wait a moment.',
      maxHistory: 50,
      // VAD controls how the agent detects the start and end of a user's turn.
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: 'vad',
            vad_config: {
              interrupt_duration_ms: 160, // ms of speech before interruption triggers
              prefix_padding_ms: 300, // audio captured before speech is detected
            },
          },
          end_of_speech: {
            mode: 'vad',
            vad_config: {
              silence_duration_ms: 480, // ms of silence before turn ends
            },
          },
        },
      },
      // RTM is required for transcript events in the browser client.
      // enable_tools is required for MCP tool invocation.
      advancedFeatures: { enable_rtm: true, enable_tools: true },
      // Required for browser RTM events:
      // - data_channel: 'rtm' enables RTM delivery path for state/metrics/errors
      // - enable_error_message emits AGENT_ERROR payloads
      // - enable_metrics emits AGENT_METRICS latency payloads
      parameters: {
        // web client → ultra-low-latency watchwise profile
        audio_scenario: 'chorus',
        data_channel: 'rtm',
        enable_error_message: true,
        enable_metrics: true,
      },
    })
      .withStt(
        new DeepgramSTT({
          model: 'nova-3',
          language: 'en',
        }),
        // BYOK: uncomment the following block and set NEXT_DEEPGRAM_API_KEY
        // new DeepgramSTT({
        //   apiKey: requireEnv('NEXT_DEEPGRAM_API_KEY'),
        //   model: 'nova-3',
        //   language: 'en',
        // }),
      )
      .withLlm(
        new OpenAI({
          model: 'gpt-4o-mini',
          greetingMessage: GREETING,
          failureMessage: 'Please wait a moment.',
          maxHistory: 15,
          params: {
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.95,
          },
        }),
        // BYOK: uncomment the following block and set NEXT_LLM_API_KEY and NEXT_LLM_URL
        // new OpenAI({
        //   apiKey: requireEnv('NEXT_LLM_API_KEY'),
        //   url: requireEnv('NEXT_LLM_URL'),
        //   model: 'gpt-4o-mini',
        //   greetingMessage: GREETING,
        //   failureMessage: 'Please wait a moment.',
        //   maxHistory: 15,
        //   maxTokens: 1024,
        //   temperature: 0.7,
        //   topP: 0.95,
        // }),
      )
      .withTts(
        new MiniMaxTTS({
          model: 'speech_2_6_turbo',
          voiceId: 'English_captivating_female1',
        }),
        // BYOK — ElevenLabs (set NEXT_ELEVENLABS_API_KEY; optional NEXT_ELEVENLABS_VOICE_ID)
        // new (await import('agora-agents')).ElevenLabsTTS({
        //   key: requireEnv('NEXT_ELEVENLABS_API_KEY'),
        //   modelId: 'eleven_flash_v2_5',
        //   voiceId: process.env.NEXT_ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB',
        //   sampleRate: 24000,
        // }),
      );

    // remoteUids restricts the agent to only process audio from this user
    const session = agent.createSession({
      name: `watchwise-${Date.now()}`,
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.hours(1),
      debug: false, // enable debug to show restful API calls in the console
    });

    const agentId = await session.start();

    const payload = {
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
    } as AgentResponse;
    logApiResponse('/api/invite-agent', {
      status: 200,
      body: payload,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error starting conversation:', error);
    const payload = {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to start conversation',
    };
    logApiResponse('/api/invite-agent', {
      status: 500,
      body: payload,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload, { status: 500 });
  }
}
