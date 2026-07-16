import { createServerFn } from "@tanstack/react-start";
import { analyzeScoutData } from "./analytics.functions";
import { listScripts } from "./script.functions";

export type PostFormat = "Reel" | "Carousel" | "Story" | "Post";
export type PostStatus = "Idea" | "Script Ready" | "Scheduled" | "Published";

export interface ScheduledPost {
  id: string;
  scheduled_date: string; // YYYY-MM-DD
  slot: number;
  title: string;
  pillar: string;
  format: PostFormat;
  status: PostStatus;
  score: number;
  notes: string | null;
  script_id: string | null;
  created_at: string;
  updated_at: string;
}

const FORMATS: PostFormat[] = ["Reel", "Carousel", "Story", "Post"];
const PEAK_SLOTS = [18, 12, 8]; // priority slots: 6pm, noon, 8am (24h)

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const listScheduledPosts = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScheduledPost[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .order("scheduled_date", { ascending: true })
      .order("slot", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ScheduledPost[];
  },
);

interface UpsertInput {
  id?: string;
  scheduled_date: string;
  slot: number;
  title: string;
  pillar: string;
  format: PostFormat;
  status?: PostStatus;
  score?: number;
  notes?: string | null;
  script_id?: string | null;
}

export const upsertScheduledPost = createServerFn({ method: "POST" })
  .inputValidator((data: UpsertInput) => {
    if (!data?.scheduled_date || !data.title || !data.pillar || !data.format) {
      throw new Error("scheduled_date, title, pillar, format required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ScheduledPost> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      scheduled_date: data.scheduled_date,
      slot: data.slot ?? 0,
      title: data.title,
      pillar: data.pillar,
      format: data.format,
      status: data.status ?? "Idea",
      score: data.score ?? 70,
      notes: data.notes ?? null,
      script_id: data.script_id ?? null,
    };
    const q = data.id
      ? supabaseAdmin.from("scheduled_posts").update(row).eq("id", data.id).select("*").single()
      : supabaseAdmin.from("scheduled_posts").insert(row).select("*").single();
    const { data: out, error } = await q;
    if (error) throw new Error(error.message);
    return out as unknown as ScheduledPost;
  });

export const movePost = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; scheduled_date: string; slot: number }) => {
    if (!data?.id || !data.scheduled_date) throw new Error("id and date required");
    return data;
  })
  .handler(async ({ data }): Promise<ScheduledPost> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: out, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ scheduled_date: data.scheduled_date, slot: data.slot })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out as unknown as ScheduledPost;
  });

export const deleteScheduledPost = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("scheduled_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateScheduledPost = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data }): Promise<ScheduledPost> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src, error: e1 } = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    const s = src as unknown as ScheduledPost;
    const { data: out, error } = await supabaseAdmin
      .from("scheduled_posts")
      .insert({
        scheduled_date: s.scheduled_date,
        slot: (s.slot ?? 0) + 1,
        title: `${s.title} (copy)`,
        pillar: s.pillar,
        format: s.format,
        status: "Idea",
        score: s.score,
        notes: s.notes,
        script_id: s.script_id,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out as unknown as ScheduledPost;
  });

export const markPostPublished = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data }): Promise<ScheduledPost> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: out, error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "Published" })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out as unknown as ScheduledPost;
  });

interface AutoPlanInput {
  startDate?: string; // YYYY-MM-DD, defaults to today
  days?: number; // default 30
  clear?: boolean; // clear existing scheduled (non-published) posts in the window first
  scopeWeekOnly?: boolean; // regenerate current week only (7 days)
}

export const autoPlanCalendar = createServerFn({ method: "POST" })
  .inputValidator((data: AutoPlanInput | undefined) => data ?? {})
  .handler(async ({ data }): Promise<{ inserted: number; from: string; to: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Gather sources
    const [analytics, scripts] = await Promise.all([
      analyzeScoutData({ data: {} }).catch(() => null),
      listScripts().catch(() => []),
    ]);

    const start = data.startDate ? new Date(data.startDate + "T00:00:00") : new Date();
    start.setHours(0, 0, 0, 0);
    const days = data.scopeWeekOnly ? 7 : data.days ?? 30;
    const from = toYMD(start);
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + days - 1);
    const to = toYMD(endDate);

    // Build idea pool
    interface Idea {
      title: string;
      pillar: string;
      format: PostFormat;
      score: number;
      status: PostStatus;
      script_id: string | null;
    }
    const pool: Idea[] = [];

    // 1. Saved scripts (highest priority - already written)
    for (const s of scripts) {
      pool.push({
        title: s.hook || s.topic,
        pillar: "Client Transformations",
        format: "Reel",
        score: s.script?.watchTimeScore ?? 80,
        status: "Script Ready",
        script_id: s.id,
      });
    }

    // 2. Recommendations from analytics
    if (analytics?.recommendations) {
      const topPillars = (analytics.pillars ?? [])
        .filter((p) => p.count > 0)
        .map((p) => p.pillar);
      analytics.recommendations.forEach((r, i) => {
        pool.push({
          title: r.hook,
          pillar: topPillars[i % Math.max(topPillars.length, 1)] ?? "Fat Loss",
          format: r.format,
          score: r.score,
          status: "Idea",
          script_id: null,
        });
      });
    }

    // 3. Filler content - rotate pillars & formats to guarantee `days` slots
    const fallbackPillars = [
      "Fat Loss",
      "Muscle Gain",
      "Nutrition",
      "Motivation",
      "Workout Tips",
      "Client Transformations",
      "Education",
      "Lifestyle",
    ];
    const fillerTemplates = [
      "3 mistakes killing your progress",
      "What I eat in a day",
      "Client transformation reveal",
      "Try this at home workout",
      "The truth about fat loss",
      "5-minute mobility routine",
      "Q&A: your top questions",
      "Behind-the-scenes coaching",
    ];
    let f = 0;
    while (pool.length < days * 2) {
      pool.push({
        title: fillerTemplates[f % fillerTemplates.length],
        pillar: fallbackPillars[f % fallbackPillars.length],
        format: FORMATS[f % FORMATS.length],
        score: 65 + ((f * 3) % 15),
        status: "Idea",
        script_id: null,
      });
      f++;
    }

    // Sort by score descending - assign highest-score ideas to peak slots
    pool.sort((a, b) => b.score - a.score);

    // Clear window
    if (data.clear ?? true) {
      await supabaseAdmin
        .from("scheduled_posts")
        .delete()
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .neq("status", "Published");
    }

    // Assign one post per day, applying pillar/format diversity rules
    const rows: Omit<ScheduledPost, "id" | "created_at" | "updated_at">[] = [];
    const used = new Set<number>();
    let lastPillar = "";
    let lastFormat: PostFormat | "" = "";

    for (let d = 0; d < days; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      const ymd = toYMD(date);

      // Pick first idea from pool not violating diversity rules
      let pickIdx = -1;
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        const cand = pool[i];
        if (cand.pillar === lastPillar) continue;
        if (cand.format === lastFormat) continue;
        pickIdx = i;
        break;
      }
      // Fallback: just avoid same pillar
      if (pickIdx === -1) {
        for (let i = 0; i < pool.length; i++) {
          if (used.has(i)) continue;
          if (pool[i].pillar === lastPillar) continue;
          pickIdx = i;
          break;
        }
      }
      if (pickIdx === -1) {
        for (let i = 0; i < pool.length; i++) {
          if (!used.has(i)) {
            pickIdx = i;
            break;
          }
        }
      }
      if (pickIdx === -1) break;

      const idea = pool[pickIdx];
      used.add(pickIdx);
      lastPillar = idea.pillar;
      lastFormat = idea.format;

      // Peak slot: top-tier score gets 18:00, mid-tier gets 12:00, else 08:00
      const slot =
        idea.score >= 85 ? PEAK_SLOTS[0] : idea.score >= 75 ? PEAK_SLOTS[1] : PEAK_SLOTS[2];

      rows.push({
        scheduled_date: ymd,
        slot,
        title: idea.title,
        pillar: idea.pillar,
        format: idea.format,
        status: idea.status,
        score: idea.score,
        notes: null,
        script_id: idea.script_id,
      });
    }

    if (rows.length === 0) return { inserted: 0, from, to };

    const { error } = await supabaseAdmin.from("scheduled_posts").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length, from, to };
  });
