import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
  context?: WatchWiseConversationContext;
}

export interface StopConversationRequest {
  agent_id: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
  onEndConversation: () => void;
  onTranscriptUpdate?: (payload: {
    transcriptText: string;
    latestUserText: string;
    latestAssistantText: string;
  }) => void;
}

export interface WatchWiseConversationContext {
  title?: string;
  mediaType?: 'movie' | 'tv';
  overview?: string;
  tagline?: string | null;
  genres?: string[];
  cast?: string[];
  crew?: string[];
  runtime?: number | null;
  seasons?: number | null;
  episodes?: number | null;
  status?: string | null;
  homepage?: string | null;
  imdbId?: string | null;
  productionCompanies?: string[];
  productionCountries?: string[];
  spokenLanguages?: string[];
  networks?: string[];
  createdBy?: string[];
}
