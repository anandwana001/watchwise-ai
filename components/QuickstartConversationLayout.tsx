'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

type QuickstartConversationLayoutProps = {
  statusPanel: ReactNode;
  pipelineMetrics: ReactNode;
  transcriptPanel: ReactNode;
  visualizer: ReactNode;
  controls: ReactNode;
  onEndConversation: () => void;
};

export function QuickstartConversationLayout({
  statusPanel,
  pipelineMetrics,
  transcriptPanel,
  visualizer,
  controls,
  onEndConversation,
}: QuickstartConversationLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col text-left">
      <header className="shrink-0 border-b border-border/70 bg-card/15 px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <Image
                src="/agora-logo-mark.svg"
                alt="Agora"
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 object-contain"
              />
              <div className="min-w-0 space-y-1">
                <p className="text-xs uppercase tracking-[0.36em] text-muted-foreground">
                  Agora Conversational AI
                </p>
                <h1 className="truncate text-2xl font-semibold tracking-[-0.04em] text-foreground md:text-[2rem]">
                  WatchWise assistant
                </h1>
              </div>
            </div>

            <Button
              variant="destructive"
              size="sm"
              className="h-9 rounded-full border border-destructive bg-transparent px-4 text-xs font-medium text-destructive hover:bg-destructive/10"
              onClick={onEndConversation}
              aria-label="End conversation with AI agent"
              title="End conversation"
            >
              End Conversation
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">{pipelineMetrics}</div>
            <div className="shrink-0">{statusPanel}</div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1 flex-col gap-5 px-5 py-5 md:px-6 md:py-6 lg:flex-row lg:gap-6">
        <aside className="order-2 min-h-[20rem] w-full shrink-0 lg:order-1 lg:h-full lg:w-[22rem] xl:w-[24rem]">
          {transcriptPanel}
        </aside>

        <main className="order-1 flex min-h-0 flex-1 flex-col rounded-[28px] border border-border/60 bg-card/10 px-4 py-4 lg:order-2 lg:px-6 lg:py-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-[18rem] flex-1 items-center justify-center">
              {visualizer}
            </div>
            <div className="shrink-0 pt-6">{controls}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
