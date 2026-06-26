import { NextRequest, NextResponse } from 'next/server';
import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { logApiRequest, logApiResponse } from '@/lib/api-logging';

const EXPIRATION_TIME_IN_SECONDS = 3600;

function generateChannelName(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ai-conversation-${timestamp}-${random}`;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const APP_CERTIFICATE = process.env.NEXT_AGORA_APP_CERTIFICATE;

  if (!APP_ID || !APP_CERTIFICATE) {
    return NextResponse.json(
      { error: 'Agora credentials are not set' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const uidStr = searchParams.get('uid');
  const parsedUid = uidStr ? parseInt(uidStr, 10) : Number.NaN;
  const uid = Number.isNaN(parsedUid) || parsedUid <= 0
    ? Math.floor(Math.random() * 9_999_000) + 1000
    : parsedUid;
  const channelName = searchParams.get('channel') || generateChannelName();

  logApiRequest('/api/generate-agora-token', {
    method: 'GET',
    url: request.url,
    query: {
      uid: uidStr,
      channel: searchParams.get('channel'),
    },
  });

  const expirationTime =
    Math.floor(Date.now() / 1000) + EXPIRATION_TIME_IN_SECONDS;

  try {
    // console.log('Building RTC+RTM token: uid =', uid, 'channel =', channelName);
    const token = RtcTokenBuilder.buildTokenWithRtm(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid.toString(),
      RtcRole.PUBLISHER,
      expirationTime,
      expirationTime,
    );
    // console.log('Token generated successfully (RTC + RTM)');

    const payload = {
      token,
      uid: uid.toString(),
      channel: channelName,
    };
    logApiResponse('/api/generate-agora-token', {
      status: 200,
      body: payload,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error generating Agora token:', error);
    const payload = {
      error: 'Failed to generate Agora token',
      details: error instanceof Error ? error.message : String(error),
    };
    logApiResponse('/api/generate-agora-token', {
      status: 500,
      body: payload,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload, { status: 500 });
  }
}
