'use client';

import { useEffect, useMemo, useRef } from 'react';

type TranscriptMessage = {
  turn_id?: string | number;
  uid: number;
  text?: string;
  createdAt?: number;
};

type QuickstartTranscriptPanelProps = {
  messageList: TranscriptMessage[];
  currentInProgressMessage: TranscriptMessage | null;
  agentUID: string;
};

function formatMessageTime(createdAt?: number) {
  if (!createdAt) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

export function QuickstartTranscriptPanel({
  messageList,
  currentInProgressMessage,
  agentUID,
}: QuickstartTranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () =>
      currentInProgressMessage
        ? [...messageList, currentInProgressMessage]
        : messageList,
    [currentInProgressMessage, messageList],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card/15 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
      aria-label="Transcription panel"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-5 py-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
            Transcript
          </h2>
          <p className="text-xs text-muted-foreground">Live voice turns</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/20 px-4 py-10 text-center text-sm text-muted-foreground">
            Start speaking to see the live transcript here.
          </div>
        ) : (
          messages.map((message, index) => {
            const isAgent = String(message.uid) === agentUID;
            const label = isAgent ? 'Agent' : 'You';
            const text = message.text?.trim();
            const time = formatMessageTime(message.createdAt);

            return (
              <article
                key={`${message.turn_id ?? message.uid}-${index}`}
                className={`flex flex-col gap-1.5 ${isAgent ? 'items-start' : 'items-end'}`}
              >
                <div className="flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
                  <span className="uppercase tracking-[0.22em]">{label}</span>
                  {time && <span className="font-normal">{time}</span>}
                </div>
                <div
                  className={`max-w-full whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm leading-6 ${
                    isAgent
                      ? 'border-[#2f2f2f] bg-[#1a1a1a] text-[#f2f2f2]'
                      : 'border-[#d7d7d7] bg-[#fdfcfb] text-black'
                  }`}
                >
                  {text || '...'}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
