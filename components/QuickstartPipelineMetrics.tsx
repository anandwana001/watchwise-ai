'use client';

export type QuickstartAgentMetric = {
  type: string;
  name: string;
  value: number;
  timestamp: number;
};

type QuickstartPipelineMetricsProps = {
  metrics: QuickstartAgentMetric[];
};

const PIPELINE = [
  { key: 'stt', label: 'Deepgram STT', metricTypes: ['stt', 'asr'] },
  { key: 'llm', label: 'OpenAI LLM', metricTypes: ['llm', 'mllm'] },
  { key: 'tts', label: 'MiniMax TTS', metricTypes: ['tts'] },
] as const;

function formatMetricName(name: string) {
  return name.replace(/[_-]+/g, ' ');
}

export function QuickstartPipelineMetrics({
  metrics,
}: QuickstartPipelineMetricsProps) {
  const latestByType = new Map<string, QuickstartAgentMetric>();
  for (const metric of metrics) {
    latestByType.set(metric.type.toLowerCase(), metric);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Pipeline
      </span>
      {PIPELINE.map((step, index) => {
        const metric = step.metricTypes
          .map((type) => latestByType.get(type))
          .find(Boolean);

        return (
          <div key={step.key} className="flex items-center gap-1.5">
            {index > 0 && (
              <span className="text-xs text-muted-foreground" aria-hidden="true">
                /
              </span>
            )}
            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-card/30 px-3 py-1.5 text-[11px] font-semibold leading-none text-foreground shadow-sm">
              <span className="whitespace-nowrap">{step.label}</span>
              {metric ? (
                <span
                  className="whitespace-nowrap text-primary/90"
                  title={new Date(metric.timestamp).toLocaleTimeString()}
                >
                  {formatMetricName(metric.name)} {Math.round(metric.value)}ms
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
