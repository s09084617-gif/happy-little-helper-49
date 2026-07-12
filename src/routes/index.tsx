import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  PenTool,
  CalendarDays,
  BarChart3,
  MessageSquare,
  Images,
  Activity,
  Target,
  Lightbulb,
  FileText,
  Send,
  Zap,
  Loader2,
} from "lucide-react";
import { fetchScoutData } from "@/lib/scout.functions";

export const Route = createFileRoute("/")({
  component: Index,
});

interface AgentCard {
  id: string;
  title: string;
  icon: React.ElementType;
  status: string;
  statusType: "waiting" | "idle" | "active" | "loading" | "error";
}

const baseAgents: AgentCard[] = [
  {
    id: "scout",
    title: "Scout Agent",
    icon: Search,
    status: "Waiting for Instagram data",
    statusType: "waiting",
  },
  { id: "script", title: "Script Agent", icon: PenTool, status: "Idle", statusType: "idle" },
  { id: "calendar", title: "Calendar Agent", icon: CalendarDays, status: "Idle", statusType: "idle" },
  { id: "analytics", title: "Analytics Agent", icon: BarChart3, status: "Idle", statusType: "idle" },
  { id: "dm", title: "DM Agent", icon: MessageSquare, status: "Idle", statusType: "idle" },
  { id: "carousel", title: "Carousel Agent", icon: Images, status: "Idle", statusType: "idle" },
];

interface SummaryMetric {
  label: string;
  value: string;
  icon: React.ElementType;
}

function Index() {
  const scout = useQuery({
    queryKey: ["scout"],
    queryFn: () => fetchScoutData(),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const agents: AgentCard[] = baseAgents.map((a) => {
    if (a.id !== "scout") return a;
    if (scout.isLoading) {
      return { ...a, status: "Fetching Instagram data…", statusType: "loading" };
    }
    if (scout.isError) {
      return { ...a, status: "Scout Agent Offline", statusType: "error" };
    }
    if (scout.data) {
      const count = scout.data.profiles.length;
      return {
        ...a,
        status: `Monitoring ${count} Instagram account${count === 1 ? "" : "s"}`,
        statusType: "active",
      };
    }
    return a;
  });

  const totalPosts = scout.data?.totalPosts ?? 0;
  const competitorsTracked = scout.data ? 4 : 0;

  const summaryMetrics: SummaryMetric[] = [
    { label: "Posts Analysed", value: String(totalPosts), icon: Activity },
    { label: "Competitors Tracked", value: String(competitorsTracked), icon: Target },
    { label: "Ideas Generated", value: "0", icon: Lightbulb },
    { label: "Scripts Created", value: "0", icon: FileText },
    { label: "DMs Pending", value: "0", icon: Send },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[500px] opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, var(--color-crimson-glow), transparent)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-6 py-8 lg:px-10 lg:py-10">
        <header className="animate-fade-in mb-10 lg:mb-14">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-crimson/20 bg-crimson/10 px-3 py-1 text-xs font-medium text-crimson">
                <Zap className="h-3.5 w-3.5" />
                <span>AI-Powered OS</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                FitWid Content Agent Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-base text-muted-foreground sm:text-lg">
                AI-powered Instagram Content Operating System
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
              <span className="status-dot" />
              <span>System operational</span>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-8 xl:flex-row">
          <main className="flex-1">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent, index) => (
                <AgentCardComponent key={agent.id} agent={agent} index={index} />
              ))}
            </div>
          </main>

          <aside className="w-full shrink-0 animate-fade-in xl:w-80 xl:pl-2">
            <div className="glass-card rounded-2xl p-6 lg:p-7">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Today&apos;s Summary
                </h2>
                <span className="rounded-full bg-crimson/10 px-2.5 py-1 text-xs font-medium text-crimson">
                  {scout.isLoading ? "Loading" : scout.isError ? "Offline" : "Live"}
                </span>
              </div>

              <div className="space-y-4">
                {summaryMetrics.map((metric, index) => (
                  <SummaryMetricComponent
                    key={metric.label}
                    metric={metric}
                    index={index}
                  />
                ))}
              </div>

              <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.03] p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Daily tip
                </p>
                <p className="mt-1 text-sm text-white/80">
                  {scout.isError
                    ? "Scout Agent is offline. Check your Apify token and dataset ID."
                    : scout.data
                      ? `Tracking ${scout.data.profiles.length} profiles across ${totalPosts} recent posts.`
                      : "Connecting to Apify to pull the latest Instagram data…"}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AgentCardComponent({
  agent,
  index,
}: {
  agent: AgentCard;
  index: number;
}) {
  const Icon = agent.icon;

  const statusColor =
    agent.statusType === "active"
      ? "text-emerald-400"
      : agent.statusType === "error"
        ? "text-crimson"
        : agent.statusType === "waiting" || agent.statusType === "loading"
          ? "text-crimson"
          : "text-muted-foreground";

  const barClass =
    agent.statusType === "active"
      ? "w-full bg-emerald-400"
      : agent.statusType === "error"
        ? "w-1/2 bg-crimson/70"
        : agent.statusType === "waiting" || agent.statusType === "loading"
          ? "w-3/4 bg-crimson"
          : "w-1/4 bg-white/30";

  return (
    <div
      className="glass-card group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:border-crimson/30 hover:bg-white/[0.05]"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-crimson/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-crimson/10 text-crimson ring-1 ring-crimson/20 transition-transform duration-300 group-hover:scale-110">
            <Icon className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{agent.title}</h3>
            <div className="mt-1.5 flex items-center gap-2">
              {agent.statusType === "loading" ? (
                <Loader2 className="h-3 w-3 animate-spin text-crimson" />
              ) : agent.statusType === "active" ? (
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              ) : agent.statusType === "error" ? (
                <span className="inline-block h-2 w-2 rounded-full bg-crimson" />
              ) : agent.statusType === "waiting" ? (
                <span className="status-dot animate-pulse" />
              ) : (
                <span className="status-dot-idle" />
              )}
              <span className={`text-sm font-medium ${statusColor}`}>
                {agent.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-6 flex items-center justify-between">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full transition-all duration-700 ${barClass}`} />
        </div>
      </div>
    </div>
  );
}

function SummaryMetricComponent({
  metric,
  index,
}: {
  metric: SummaryMetric;
  index: number;
}) {
  const Icon = metric.icon;

  return (
    <div
      className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
      style={{ animationDelay: `${(index + 6) * 80}ms` }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <span className="text-sm font-medium text-white/80">{metric.label}</span>
      </div>
      <span className="text-lg font-semibold tabular-nums text-white">
        {metric.value}
      </span>
    </div>
  );
}
