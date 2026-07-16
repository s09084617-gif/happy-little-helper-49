import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Trophy,
  Layers,
  TrendingUp,
  ChevronDown,
  Hash,
  Download,
  Database,
  Copy,
  Save,
  Wand2,
  Film,
  Type,
  Mic,
  Camera,
  Gauge,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { fetchScoutData } from "@/lib/scout.functions";
import {
  analyzeScoutData,
  type AnalyticsResult,
  type Recommendation,
} from "@/lib/analytics.functions";
import {
  generateScript,
  saveScript,
  listScripts,
  type ScriptContent,
} from "@/lib/script.functions";
import {
  listScheduledPosts,
  upsertScheduledPost,
  movePost,
  deleteScheduledPost,
  duplicateScheduledPost,
  markPostPublished,
  autoPlanCalendar,
  type ScheduledPost,
  type PostFormat,
  type PostStatus,
} from "@/lib/calendar.functions";
import { Flame, CalendarCheck, CalendarClock, Plus, Trash2, MoreVertical, GripVertical } from "lucide-react";

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

  const analytics = useMutation({
    mutationFn: () => analyzeScoutData(),
  });

  const queryClient = useQueryClient();
  const scripts = useQuery({
    queryKey: ["scripts"],
    queryFn: () => listScripts(),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const [scriptTarget, setScriptTarget] = useState<{
    topic: string;
    cta?: string;
    format?: "Reel" | "Carousel";
    competitorInspiration?: string;
  } | null>(null);
  const [scriptContent, setScriptContent] = useState<ScriptContent | null>(null);
  const [scriptSavedId, setScriptSavedId] = useState<string | null>(null);

  const scriptGen = useMutation({
    mutationFn: (input: {
      topic: string;
      cta?: string;
      format?: "Reel" | "Carousel";
      competitorInspiration?: string;
    }) =>
      generateScript({
        data: {
          topic: input.topic,
          cta: input.cta,
          format: input.format,
          competitorInspiration: input.competitorInspiration,
        },
      }),
    onSuccess: (content) => {
      setScriptContent(content);
      setScriptSavedId(null);
    },
  });

  const scriptSave = useMutation({
    mutationFn: () => {
      if (!scriptTarget || !scriptContent) throw new Error("Nothing to save");
      return saveScript({
        data: {
          topic: scriptTarget.topic,
          competitorInspiration: scriptTarget.competitorInspiration,
          content: scriptContent,
        },
      });
    },
    onSuccess: (row) => {
      setScriptSavedId(row.id);
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
    },
  });

  // ---------- Calendar Agent ----------
  const scheduled = useQuery({
    queryKey: ["scheduled_posts"],
    queryFn: () => listScheduledPosts(),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const invalidateCal = () =>
    queryClient.invalidateQueries({ queryKey: ["scheduled_posts"] });

  const autoPlan = useMutation({
    mutationFn: (opts?: { scopeWeekOnly?: boolean; startDate?: string }) =>
      autoPlanCalendar({ data: { ...(opts ?? {}), clear: true } }),
    onSuccess: () => invalidateCal(),
  });
  const moveMut = useMutation({
    mutationFn: (v: { id: string; scheduled_date: string; slot: number }) =>
      movePost({ data: v }),
    onSuccess: () => invalidateCal(),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteScheduledPost({ data: { id } }),
    onSuccess: () => invalidateCal(),
  });
  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateScheduledPost({ data: { id } }),
    onSuccess: () => invalidateCal(),
  });
  const publishMut = useMutation({
    mutationFn: (id: string) => markPostPublished({ data: { id } }),
    onSuccess: () => invalidateCal(),
  });
  const createMut = useMutation({
    mutationFn: (v: {
      scheduled_date: string;
      slot: number;
      title: string;
      pillar: string;
      format: PostFormat;
    }) => upsertScheduledPost({ data: v }),
    onSuccess: () => invalidateCal(),
  });

  const scheduledPosts = scheduled.data ?? [];
  const calendarMetrics = computeCalendarMetrics(scheduledPosts);

  const scoutReady = !!scout.data && scout.data.profiles.length > 0;

  const analyticsStatus: {
    status: string;
    statusType: AgentCard["statusType"];
  } = analytics.isPending
    ? { status: "Analysing competitor posts…", statusType: "loading" }
    : analytics.isError
      ? { status: "Analysis failed", statusType: "error" }
      : analytics.data
        ? {
            status: `Analysed ${analytics.data.postsAnalysed} posts`,
            statusType: "active",
          }
        : scoutReady
          ? { status: "Ready to analyse", statusType: "waiting" }
          : { status: "Idle", statusType: "idle" };

  const scriptCount = scripts.data?.length ?? 0;
  const scriptStatus: { status: string; statusType: AgentCard["statusType"] } =
    scriptGen.isPending
      ? { status: "Writing your script…", statusType: "loading" }
      : scriptContent
        ? { status: scriptSavedId ? "Saved to Library" : "Draft ready", statusType: "active" }
        : scriptCount > 0
          ? { status: `${scriptCount} script${scriptCount === 1 ? "" : "s"} in Library`, statusType: "active" }
          : { status: "Idle", statusType: "idle" };


  const agents: AgentCard[] = baseAgents.map((a) => {
    if (a.id === "scout") {
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
    }
    if (a.id === "analytics") {
      return { ...a, ...analyticsStatus };
    }
    if (a.id === "script") {
      return { ...a, ...scriptStatus };
    }
    if (a.id === "calendar") {
      if (autoPlan.isPending) return { ...a, status: "Generating 30-day plan…", statusType: "loading" };
      if (autoPlan.isError) return { ...a, status: "Auto-plan failed", statusType: "error" };
      if (scheduledPosts.length > 0)
        return {
          ...a,
          status: `${calendarMetrics.thisWeek} posts this week · ${scheduledPosts.length} planned`,
          statusType: "active",
        };
      return { ...a, status: "Ready to plan", statusType: "waiting" };
    }
    return a;
  });

  const totalPosts = scout.data?.totalPosts ?? 0;
  const competitorsTracked = scout.data ? 4 : 0;

  const summaryMetrics: SummaryMetric[] = [
    { label: "Posts Analysed", value: String(totalPosts), icon: Activity },
    { label: "Competitors Tracked", value: String(competitorsTracked), icon: Target },
    { label: "Ideas Generated", value: String(analytics.data?.recommendations.length ?? 0), icon: Lightbulb },
    { label: "Scripts Created", value: String(scriptCount), icon: FileText },
    { label: "Posts Scheduled", value: String(scheduledPosts.length), icon: CalendarCheck },
    { label: "This Week's Plan", value: String(calendarMetrics.thisWeek), icon: CalendarClock },
    { label: "Publishing Streak", value: `${calendarMetrics.streak}d`, icon: Flame },
    { label: "DMs Pending", value: "0", icon: Send },
  ];

  const openScriptFor = (input: {
    topic: string;
    cta?: string;
    format?: "Reel" | "Carousel";
    competitorInspiration?: string;
  }) => {
    setScriptTarget(input);
    setScriptContent(null);
    setScriptSavedId(null);
    scriptGen.mutate(input);
  };


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
          <main className="flex-1 space-y-8">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent, index) => (
                <AgentCardComponent
                  key={agent.id}
                  agent={agent}
                  index={index}
                  scoutExtra={
                    agent.id === "scout"
                      ? {
                          lastSyncedAt: scout.data ? scout.dataUpdatedAt : null,
                          profileCount: scout.data?.profiles.length ?? 0,
                          postCount: totalPosts,
                          isFetching: scout.isFetching,
                          isError: scout.isError,
                          isSuccess: scout.isSuccess,
                          errorMessage:
                            scout.error instanceof Error
                              ? scout.error.message
                              : scout.isError
                                ? "Failed to sync"
                                : null,
                          onRefresh: () => scout.refetch(),
                        }
                      : undefined
                  }
                  analyticsExtra={
                    agent.id === "analytics"
                      ? {
                          canRun: scoutReady,
                          isPending: analytics.isPending,
                          hasResult: !!analytics.data,
                          errorMessage:
                            analytics.error instanceof Error
                              ? analytics.error.message
                              : analytics.isError
                                ? "Analysis failed"
                                : null,
                          onRun: () => analytics.mutate(),
                        }
                      : undefined
                  }
                />
              ))}
            </div>

            {(analytics.isPending || analytics.data || analytics.isError) && (
              <AnalyticsPanel
                data={analytics.data ?? null}
                isPending={analytics.isPending}
                errorMessage={
                  analytics.error instanceof Error
                    ? analytics.error.message
                    : analytics.isError
                      ? "Analysis failed"
                      : null
                }
                onGenerateScript={(rec) =>
                  openScriptFor({
                    topic: rec.hook,
                    cta: rec.cta,
                    format: rec.format,
                  })
                }
              />
            )}

            {(scriptTarget || scriptGen.isPending || scriptContent) && (
              <ScriptPanel
                target={scriptTarget}
                content={scriptContent}
                isGenerating={scriptGen.isPending}
                errorMessage={
                  scriptGen.error instanceof Error
                    ? scriptGen.error.message
                    : scriptGen.isError
                      ? "Generation failed"
                      : null
                }
                onRegenerate={() => {
                  if (scriptTarget) {
                    setScriptContent(null);
                    setScriptSavedId(null);
                    scriptGen.mutate(scriptTarget);
                  }
                }}
                onSave={() => scriptSave.mutate()}
                isSaving={scriptSave.isPending}
                savedId={scriptSavedId}
                saveError={
                  scriptSave.error instanceof Error
                    ? scriptSave.error.message
                    : scriptSave.isError
                      ? "Save failed"
                      : null
                }
                onClose={() => {
                  setScriptTarget(null);
                  setScriptContent(null);
                  setScriptSavedId(null);
                  scriptGen.reset();
                  scriptSave.reset();
                }}
                libraryCount={scriptCount}
              />
            )}

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

interface ScoutExtra {
  lastSyncedAt: number | null;
  profileCount: number;
  postCount: number;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
}

function formatSyncTime(ts: number | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function AgentCardComponent({
  agent,
  index,
  scoutExtra,
  analyticsExtra,
}: {
  agent: AgentCard;
  index: number;
  scoutExtra?: ScoutExtra;
  analyticsExtra?: AnalyticsExtra;
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

      {scoutExtra ? <ScoutLastSync extra={scoutExtra} /> : null}
      {analyticsExtra ? <AnalyticsRunControl extra={analyticsExtra} /> : null}
    </div>
  );
}

interface AnalyticsExtra {
  canRun: boolean;
  isPending: boolean;
  hasResult: boolean;
  errorMessage: string | null;
  onRun: () => void;
}

function AnalyticsRunControl({ extra }: { extra: AnalyticsExtra }) {
  const { canRun, isPending, hasResult, errorMessage, onRun } = extra;
  return (
    <div className="relative mt-5 border-t border-white/5 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Analyst</span>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-crimson/20 bg-crimson/10 px-2.5 py-1 text-xs font-medium text-crimson transition-colors hover:bg-crimson/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          <span>
            {isPending ? "Analysing" : hasResult ? "Re-run analysis" : "Run analysis"}
          </span>
        </button>
      </div>
      {!canRun && !isPending ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Waiting for Scout Agent data.
        </p>
      ) : null}
      {errorMessage && !isPending ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-crimson">
          <AlertCircle className="h-3.5 w-3.5" /> {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

const PILLAR_COLORS = [
  "#CC0000",
  "#F87171",
  "#FB923C",
  "#FBBF24",
  "#34D399",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
];

function AnalyticsPanel({
  data,
  isPending,
  errorMessage,
  onGenerateScript,
}: {
  data: AnalyticsResult | null;
  isPending: boolean;
  errorMessage: string | null;
  onGenerateScript?: (rec: Recommendation) => void;
}) {
  return (
    <section className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-crimson/10 text-crimson ring-1 ring-crimson/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Analytics Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              {isPending
                ? "AI is analysing every scraped post…"
                : data
                  ? `${data.postsAnalysed} posts analysed · updated ${new Date(data.generatedAt).toLocaleTimeString()}${data.fromCache ? " · cached" : ""}`
                  : errorMessage ?? "No analysis yet"}
            </p>
          </div>
        </div>
        {data ? (
          <button
            type="button"
            onClick={() => downloadReport(data)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-crimson/20 bg-crimson/10 px-3 py-2 text-xs font-medium text-crimson transition-colors hover:bg-crimson/20"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Report</span>
          </button>
        ) : null}
      </div>

      {isPending ? (
        <div className="glass-card flex items-center gap-3 rounded-2xl p-8 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-crimson" />
          Running competitor analysis. This usually takes 10–20 seconds…
        </div>
      ) : errorMessage && !data ? (
        <div className="glass-card flex items-center gap-3 rounded-2xl border-crimson/30 p-6 text-sm text-crimson">
          <AlertCircle className="h-5 w-5" /> {errorMessage}
        </div>
      ) : data ? (
        <div className="space-y-4">
          {data.fromCache ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5 text-crimson" />
              Loaded from cache — Scout data unchanged since last run.
            </div>
          ) : null}

          <CollapsibleSection
            icon={Trophy}
            title="Competitor Leaderboard"
            subtitle="Sorted by engagement rate"
            defaultOpen
          >
            {data.leaderboard.length === 0 ? (
              <EmptyRow>No competitor data.</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 font-medium">Username</th>
                      <th className="pb-2 text-right font-medium">Followers</th>
                      <th className="pb-2 text-right font-medium">Avg Likes</th>
                      <th className="pb-2 text-right font-medium">Avg Comm.</th>
                      <th className="pb-2 text-right font-medium">ER%</th>
                      <th className="pb-2 text-right font-medium">Growth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.leaderboard.map((r) => (
                      <tr key={r.username} className="text-white/90">
                        <td className="py-2 font-medium">@{r.username}</td>
                        <td className="py-2 text-right tabular-nums">{formatNum(r.followers)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatNum(Math.round(r.avgLikes))}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatNum(Math.round(r.avgComments))}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums text-crimson">
                          {r.engagementRate.toFixed(2)}%
                        </td>
                        <td className="py-2 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
                              <span
                                className="block h-full rounded-full bg-emerald-400"
                                style={{ width: `${r.growthScore}%` }}
                              />
                            </span>
                            <span className="w-8 text-right text-xs tabular-nums text-white/80">
                              {r.growthScore}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection icon={Layers} title="Content Pillars" subtitle="Distribution across scraped posts">
            <PillarsDonut pillars={data.pillars} />
          </CollapsibleSection>

          <CollapsibleSection
            icon={TrendingUp}
            title="Opportunity Finder"
            subtitle="10 gaps and trends across competitors"
          >
            {data.opportunities.length === 0 ? (
              <EmptyRow>No opportunities found.</EmptyRow>
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {data.opportunities.map((o, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3 text-sm text-white/90"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-crimson/15 text-xs font-semibold text-crimson">
                      {i + 1}
                    </span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            icon={Lightbulb}
            title="AI Recommendations"
            subtitle="10 content ideas tailored to @sahil_r_fitness"
          >
            {data.recommendations.length === 0 ? (
              <EmptyRow>No recommendations generated.</EmptyRow>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {data.recommendations.map((r, i) => (
                  <RecommendationCard
                    key={i}
                    rec={r}
                    index={i}
                    onGenerateScript={onGenerateScript}
                  />
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            icon={Hash}
            title="Trending Keywords"
            subtitle="Top 25 words and hashtags from competitor captions"
          >
            {data.keywords.length === 0 ? (
              <EmptyRow>No keywords extracted.</EmptyRow>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.keywords.map((k) => (
                  <a
                    key={k.term}
                    href={
                      k.isHashtag
                        ? `https://www.instagram.com/explore/tags/${encodeURIComponent(k.term.replace(/^#/, ""))}/`
                        : `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(k.term)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      k.isHashtag
                        ? "border-crimson/30 bg-crimson/10 text-crimson hover:bg-crimson/20"
                        : "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                    }`}
                  >
                    <span>{k.term}</span>
                    <span className="tabular-nums opacity-60">{k.count}</span>
                  </a>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>
      ) : null}
    </section>
  );
}

function CollapsibleSection({
  icon: Icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.03] lg:px-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-crimson/10 text-crimson ring-1 ring-crimson/20">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? <div className="border-t border-white/5 px-5 py-5 lg:px-6">{children}</div> : null}
    </div>
  );
}

function PillarsDonut({ pillars }: { pillars: AnalyticsResult["pillars"] }) {
  const total = pillars.reduce((s, p) => s + p.count, 0);
  const data = pillars.filter((p) => p.count > 0);
  if (total === 0) return <EmptyRow>No posts classified yet.</EmptyRow>;
  return (
    <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="pillar"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={entry.pillar} fill={PILLAR_COLORS[i % PILLAR_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "rgba(0,0,0,0.9)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
              itemStyle={{ color: "#fff" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2">
        {pillars.map((p, i) => {
          const pct = total > 0 ? ((p.count / total) * 100).toFixed(0) : "0";
          return (
            <li
              key={p.pillar}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 text-white/90">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: PILLAR_COLORS[i % PILLAR_COLORS.length] }}
                />
                {p.pillar}
              </span>
              <span className="tabular-nums text-xs text-muted-foreground">
                {p.count} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecommendationCard({
  rec,
  index,
  onGenerateScript,
}: {
  rec: Recommendation;
  index: number;
  onGenerateScript?: (rec: Recommendation) => void;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-crimson/15 text-[10px] text-crimson">
            {index + 1}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              rec.format === "Reel"
                ? "bg-crimson/15 text-crimson"
                : "bg-emerald-400/15 text-emerald-400"
            }`}
          >
            {rec.format}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-emerald-400">
          <TrendingUp className="h-3 w-3" />
          {rec.score}
        </span>
      </div>
      <p className="text-sm leading-snug text-white/95">{rec.hook}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="text-white/60">CTA:</span> {rec.cta}
      </p>
      {onGenerateScript ? (
        <button
          type="button"
          onClick={() => onGenerateScript(rec)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-crimson/20 bg-crimson/10 px-2.5 py-1.5 text-xs font-semibold text-crimson transition-colors hover:bg-crimson/20"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Generate Script
        </button>
      ) : null}
    </div>
  );
}


function downloadReport(data: AnalyticsResult) {
  const md = buildMarkdownReport(data);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date(data.generatedAt).toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `fitwid-analytics-${stamp}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildMarkdownReport(data: AnalyticsResult): string {
  const lines: string[] = [];
  lines.push(`# FitWid Analytics Report`);
  lines.push(``);
  lines.push(`_Generated ${new Date(data.generatedAt).toLocaleString()} · ${data.postsAnalysed} posts analysed_`);
  lines.push(``);
  lines.push(`## Competitor Leaderboard`);
  lines.push(``);
  lines.push(`| Username | Followers | Avg Likes | Avg Comments | Engagement Rate | Growth Score |`);
  lines.push(`| --- | ---: | ---: | ---: | ---: | ---: |`);
  data.leaderboard.forEach((r) => {
    lines.push(
      `| @${r.username} | ${r.followers.toLocaleString()} | ${Math.round(r.avgLikes).toLocaleString()} | ${Math.round(r.avgComments).toLocaleString()} | ${r.engagementRate.toFixed(2)}% | ${r.growthScore} |`,
    );
  });
  lines.push(``);
  lines.push(`## Content Pillars`);
  lines.push(``);
  data.pillars.forEach((p) => lines.push(`- **${p.pillar}** — ${p.count} posts`));
  lines.push(``);
  lines.push(`## Opportunity Finder`);
  lines.push(``);
  data.opportunities.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  lines.push(``);
  lines.push(`## AI Recommendations`);
  lines.push(``);
  data.recommendations.forEach((r, i) => {
    lines.push(`### ${i + 1}. [${r.format}] ${r.hook}`);
    lines.push(`- **CTA:** ${r.cta}`);
    lines.push(`- **Estimated engagement:** ${r.score}/100`);
    lines.push(``);
  });
  lines.push(`## Trending Keywords`);
  lines.push(``);
  lines.push(data.keywords.map((k) => `\`${k.term}\` (${k.count})`).join(" · "));
  lines.push(``);
  return lines.join("\n");
}



function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function ScoutLastSync({ extra }: { extra: ScoutExtra }) {
  const {
    lastSyncedAt,
    profileCount,
    postCount,
    isFetching,
    isError,
    isSuccess,
    errorMessage,
    onRefresh,
  } = extra;

  return (
    <div className="relative mt-5 border-t border-white/5 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Last Sync</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-crimson/20 bg-crimson/10 px-2.5 py-1 text-xs font-medium text-crimson transition-colors hover:bg-crimson/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          <span>{isFetching ? "Syncing" : "Refresh"}</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Time
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">
            {formatSyncTime(lastSyncedAt)}
          </p>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Profiles
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">
            {profileCount}
          </p>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Posts
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">
            {postCount}
          </p>
        </div>
      </div>

      {!isFetching && (isSuccess || isError) ? (
        <div
          className={`mt-3 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            isError
              ? "bg-crimson/10 text-crimson"
              : "bg-emerald-400/10 text-emerald-400"
          }`}
        >
          {isError ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span className="truncate">
            {isError ? errorMessage ?? "Sync failed" : "Sync Successful"}
          </span>
        </div>
      ) : null}
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

interface ScriptTarget {
  topic: string;
  cta?: string;
  format?: "Reel" | "Carousel";
  competitorInspiration?: string;
}

function ScriptPanel({
  target,
  content,
  isGenerating,
  errorMessage,
  onRegenerate,
  onSave,
  isSaving,
  savedId,
  saveError,
  onClose,
  libraryCount,
}: {
  target: ScriptTarget | null;
  content: ScriptContent | null;
  isGenerating: boolean;
  errorMessage: string | null;
  onRegenerate: () => void;
  onSave: () => void;
  isSaving: boolean;
  savedId: string | null;
  saveError: string | null;
  onClose: () => void;
  libraryCount: number;
}) {
  return (
    <section className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-crimson/10 text-crimson ring-1 ring-crimson/20">
            <PenTool className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Script Studio</h2>
            <p className="text-sm text-muted-foreground">
              {isGenerating
                ? "AI is writing your Reel script…"
                : target
                  ? `Idea: ${target.topic.slice(0, 90)}${target.topic.length > 90 ? "…" : ""}`
                  : "Pick a recommendation to generate a script"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
            Library: {libraryCount}
          </span>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={!target || isGenerating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
            Regenerate
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!content || isSaving || !!savedId}
            className="inline-flex items-center gap-1.5 rounded-lg border border-crimson/20 bg-crimson/10 px-3 py-2 text-xs font-semibold text-crimson transition-colors hover:bg-crimson/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : savedId ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {savedId ? "Saved" : isSaving ? "Saving" : "Save to Library"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white/60 transition-colors hover:bg-white/[0.08]"
            aria-label="Close script panel"
          >
            ✕
          </button>
        </div>
      </div>

      {saveError ? (
        <div className="glass-card flex items-center gap-2 rounded-2xl border-crimson/30 p-3 text-xs text-crimson">
          <AlertCircle className="h-4 w-4" /> {saveError}
        </div>
      ) : null}

      {isGenerating ? (
        <div className="glass-card flex items-center gap-3 rounded-2xl p-8 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-crimson" />
          Crafting hooks, script, captions and shot list…
        </div>
      ) : errorMessage && !content ? (
        <div className="glass-card flex items-center gap-3 rounded-2xl border-crimson/30 p-6 text-sm text-crimson">
          <AlertCircle className="h-5 w-5" /> {errorMessage}
        </div>
      ) : content ? (
        <div className="space-y-4">
          <ScriptSection icon={Sparkles} title="Viral Hooks" subtitle="3 scroll-stoppers">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {content.hooks.map((h, i) => (
                <CopyableCard key={i} value={h}>
                  <p className="text-sm leading-snug text-white/95">
                    <span className="mr-1.5 text-xs font-semibold text-crimson">#{i + 1}</span>
                    {h}
                  </p>
                </CopyableCard>
              ))}
            </div>
          </ScriptSection>

          <ScriptSection icon={Film} title="Reel Script" subtitle="45–60 seconds">
            <CopyableBlock value={content.reelScript} />
          </ScriptSection>

          <ScriptSection icon={Type} title="Short Caption">
            <CopyableBlock value={content.shortCaption} />
          </ScriptSection>

          <ScriptSection icon={FileText} title="Long Storytelling Caption">
            <CopyableBlock value={content.longCaption} />
          </ScriptSection>

          <ScriptSection icon={Send} title="Call to Action">
            <CopyableBlock value={content.cta} />
          </ScriptSection>

          <ScriptSection icon={Hash} title="Hashtags" subtitle="15 curated tags">
            <CopyableCard value={content.hashtags.join(" ")}>
              <div className="flex flex-wrap gap-1.5">
                {content.hashtags.map((h) => (
                  <span
                    key={h}
                    className="rounded-full border border-crimson/20 bg-crimson/10 px-2.5 py-0.5 text-xs font-medium text-crimson"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </CopyableCard>
          </ScriptSection>

          <ScriptSection icon={Type} title="Thumbnail Title">
            <CopyableCard value={content.thumbnailTitle}>
              <p className="text-2xl font-bold uppercase tracking-tight text-white">
                {content.thumbnailTitle}
              </p>
            </CopyableCard>
          </ScriptSection>

          <ScriptSection icon={Camera} title="B-Roll Shot List">
            <CopyableCard value={content.bRoll.map((s, i) => `${i + 1}. ${s}`).join("\n")}>
              <ol className="space-y-1.5 text-sm text-white/90">
                {content.bRoll.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-xs font-semibold text-crimson">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </CopyableCard>
          </ScriptSection>

          <ScriptSection icon={Mic} title="Voiceover Script">
            <CopyableBlock value={content.voiceover} />
          </ScriptSection>

          <ScriptSection icon={Gauge} title="Estimated Watch Time Score">
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Retention potential</span>
                <span className="text-2xl font-bold tabular-nums text-emerald-400">
                  {content.watchTimeScore}
                  <span className="text-sm text-muted-foreground">/100</span>
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-crimson to-emerald-400 transition-all duration-700"
                  style={{ width: `${content.watchTimeScore}%` }}
                />
              </div>
            </div>
          </ScriptSection>
        </div>
      ) : null}
    </section>
  );
}

function ScriptSection({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card overflow-hidden rounded-2xl px-5 py-5 lg:px-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-crimson/10 text-crimson ring-1 ring-crimson/20">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // noop
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/[0.08]"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}

function CopyableCard({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <div className="group relative rounded-lg border border-white/5 bg-white/[0.03] p-3.5">
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton value={value} />
      </div>
      {children}
    </div>
  );
}

function CopyableBlock({ value }: { value: string }) {
  return (
    <div className="group relative rounded-lg border border-white/5 bg-white/[0.03] p-4">
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton value={value} />
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{value}</p>
    </div>
  );
}
