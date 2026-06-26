import { NextResponse } from 'next/server';
import { AgoraClient, Area } from 'agora-agents';
import { StopConversationRequest } from '@/types/conversation';
import { logApiRequest, logApiResponse } from '@/lib/api-logging';

function isAgentAlreadyStoppingOrStopped(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeErr = error as {
    statusCode?: number;
    body?: { detail?: string; reason?: string };
    message?: string;
  };

  const statusCode = maybeErr.statusCode;
  const reason = maybeErr.body?.reason?.toLowerCase();
  const detail = maybeErr.body?.detail?.toLowerCase() ?? maybeErr.message?.toLowerCase() ?? '';

  if (statusCode === 404) return true;
  if (reason === 'invalidrequest' && detail.includes('already in the process of shutting down')) {
    return true;
  }
  return false;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body: StopConversationRequest = await request.json();
    const { agent_id } = body;

    logApiRequest('/api/stop-conversation', {
      method: 'POST',
      body,
    });

    if (!agent_id) {
      const payload = { error: 'agent_id is required' };
      logApiResponse('/api/stop-conversation', {
        status: 400,
        body: payload,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(payload, { status: 400 });
    }

    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    const appCertificate = process.env.NEXT_AGORA_APP_CERTIFICATE;
    if (!appId || !appCertificate) {
      throw new Error(
        'Missing Agora configuration. Set NEXT_PUBLIC_AGORA_APP_ID and NEXT_AGORA_APP_CERTIFICATE.',
      );
    }

    // area: change to Area.EU or Area.AP for European or Asia-Pacific deployments.
    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });
    try {
      await client.stopAgent(agent_id);
    } catch (error) {
      if (isAgentAlreadyStoppingOrStopped(error)) {
        // Treat stop as idempotent: agent is already exiting (or gone).
        const payload = { success: true, state: 'already-stopping' };
        logApiResponse('/api/stop-conversation', {
          status: 200,
          body: payload,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(payload);
      }
      throw error;
    }

    const payload = { success: true };
    logApiResponse('/api/stop-conversation', {
      status: 200,
      body: payload,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error stopping conversation:', error);
    const payload = {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to stop conversation',
    };
    logApiResponse('/api/stop-conversation', {
      status: 500,
      body: payload,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload, { status: 500 });
  }
}
