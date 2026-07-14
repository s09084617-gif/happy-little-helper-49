import { createServerFn } from "@tanstack/react-start";
import { createHash } from "crypto";
import { fetchScoutData, type ScoutProfile } from "./scout.functions";

export type Pillar =
  | "Fat Loss"
  | "Muscle Gain"
  | "Nutrition"
  | "Motivation"
  | "Client Transformations"
  | "Workout Tips"
  | "Lifestyle"
  | "Education";

export const PILLARS: Pillar[] = [
  "Fat Loss",
  "Muscle Gain",
  "Nutrition",
  "Motivation",
  "Client Transformations",
  "Workout Tips",
  "Lifestyle",
  "Education",
];

export interface LeaderboardRow {
  username: string;
  followers: number;
  avgLikes: number;
  avgComments: number;
  engagementRate: number;
  growthScore: number;
}

export interface Recommendation {
  hook: string;
  format: "Reel" | "Carousel";
  cta: string;
  score: number;
}

export interface TrendingKeyword {
  term: string;
  count: number;
  isHashtag: boolean;
}

export interface AnalyticsResult {
  pillars: { pillar: Pillar; count: number }[];
  leaderboard: LeaderboardRow[];
  opportunities: string[];
  recommendations: Recommendation[];
  keywords: TrendingKeyword[];
  postsAnalysed: number;
  generatedAt: number;
  fromCache?: boolean;
  inputHash?: string;
}

interface FlatPost {
  index: number;
  username: string;
  caption: string;
  likes: number;
  comments: number;
}

function flatten(profiles: ScoutProfile[]): FlatPost[] {
  const out: FlatPost[] = [];
  profiles.forEach((p) => {
    p.latestPosts.forEach((post) => {
      out.push({
        index: out.length,
        username: p.username,
        caption: post.caption ?? "",
        likes: post.likes ?? 0,
        comments: post.comments ?? 0,
      });
    });
  });
  return out;
}

function hashScout(profiles: ScoutProfile[]): string {
  const snapshot = profiles
    .map((p) => ({
      u: p.username,
      f: p.followers,
      pc: p.postsCount,
      posts: p.latestPosts.map((x) => ({
        c: (x.caption ?? "").slice(0, 400),
        l: x.likes,
        cm: x.comments,
      })),
    }))
    .sort((a, b) => a.u.localeCompare(b.u));
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

const STOPWORDS = new Set(
  "a an the and or but if then so of to in on at by for with from as is are was were be been being this that these those it its i you your my we our they their he she his her them us me do does did done have has had not no yes will would can could should just about into out up down over under more most less least very really only also all any some like get got make made new day time way well good great too much many how what when where why who whom whose here there".split(
    /\s+/,
  ),
);

function extractKeywords(posts: FlatPost[]): TrendingKeyword[] {
  const counts = new Map<string, { count: number; isHashtag: boolean }>();
  for (const p of posts) {
    const text = p.caption.toLowerCase();
    const hashtags = text.match(/#[a-z0-9_]+/g) ?? [];
    for (const h of hashtags) {
      const key = h;
      const prev = counts.get(key);
      counts.set(key, { count: (prev?.count ?? 0) + 1, isHashtag: true });
    }
    const words = text
      .replace(/#[a-z0-9_]+/g, " ")
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
    for (const w of words) {
      const prev = counts.get(w);
      counts.set(w, { count: (prev?.count ?? 0) + 1, isHashtag: prev?.isHashtag ?? false });
    }
  }
  return [...counts.entries()]
    .map(([term, v]) => ({ term, count: v.count, isHashtag: v.isHashtag }))
    .filter((k) => k.count >= 2 || k.isHashtag)
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
}

interface AiResponse {
  pillarByIndex: { index: number; pillar: string }[];
  opportunities: string[];
  recommendations: Recommendation[];
}

async function callAI(profiles: ScoutProfile[], posts: FlatPost[]): Promise<AiResponse> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const compactPosts = posts.map((p) => ({
    i: p.index,
    u: p.username,
    c: p.caption.slice(0, 260),
    l: p.likes,
    cm: p.comments,
  }));

  const profileSummary = profiles.map((p) => ({
    username: p.username,
    followers: p.followers,
    bio: (p.biography ?? "").slice(0, 200),
  }));

  const system = `You are a senior Instagram content strategist for a fitness coach @sahil_r_fitness.
Return ONLY valid JSON. Never include prose, markdown, or code fences.`;

  const user = `Analyse these Instagram competitor posts.

Competitor profiles:
${JSON.stringify(profileSummary)}

Posts (i=index, u=username, c=caption, l=likes, cm=comments):
${JSON.stringify(compactPosts)}

Return JSON with this exact shape:
{
  "pillarByIndex": [ { "index": <number>, "pillar": <one of: "Fat Loss","Muscle Gain","Nutrition","Motivation","Client Transformations","Workout Tips","Lifestyle","Education"> } ],
  "opportunities": [ 10 short strings about competitor strengths, weaknesses, gaps, and trends ],
  "recommendations": [ 10 items shaped { "hook": string, "format": "Reel" | "Carousel", "cta": string, "score": integer 60-100 } tailored for @sahil_r_fitness ]
}

Rules:
- pillarByIndex MUST include every post index exactly once.
- Opportunities must be concrete (e.g. "Transformation reels get 2x engagement — post more client wins").
- Recommendations: hook is a first-line scroll-stopper, cta is a viewer action ("Save this", "DM 'PLAN'"), score is your estimated engagement 60-100.
- Output raw JSON only.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
    throw new Error(`AI request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned invalid JSON");
    return JSON.parse(match[0]);
  }
}

export const analyzeScoutData = createServerFn({ method: "POST" })
  .inputValidator((data: { force?: boolean } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<AnalyticsResult> => {
    const scout = await fetchScoutData();
    const profiles = scout.profiles;
    const posts = flatten(profiles);
    const inputHash = hashScout(profiles);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.force) {
      const { data: cached } = await supabaseAdmin
        .from("analytics_cache")
        .select("result")
        .eq("input_hash", inputHash)
        .maybeSingle();
      if (cached?.result) {
        return { ...(cached.result as unknown as AnalyticsResult), fromCache: true, inputHash };
      }
    }

    if (posts.length === 0) {
      const empty: AnalyticsResult = {
        pillars: PILLARS.map((p) => ({ pillar: p, count: 0 })),
        leaderboard: [],
        opportunities: [],
        recommendations: [],
        keywords: [],
        postsAnalysed: 0,
        generatedAt: Date.now(),
        inputHash,
      };
      return empty;
    }

    // Deterministic: leaderboard + growth score
    const leaderboard: LeaderboardRow[] = profiles
      .map((p) => {
        const n = p.latestPosts.length || 1;
        const totalLikes = p.latestPosts.reduce((s, x) => s + (x.likes ?? 0), 0);
        const totalComments = p.latestPosts.reduce((s, x) => s + (x.comments ?? 0), 0);
        const avgLikes = totalLikes / n;
        const avgComments = totalComments / n;
        const engagementRate =
          p.followers > 0 ? ((avgLikes + avgComments) / p.followers) * 100 : 0;
        // Growth score 0-100: engagement rate weighted with reach scaling
        const reachFactor = Math.log10(Math.max(1000, p.followers)) / 7; // 0..1-ish
        const growthScore = Math.min(
          100,
          Math.round(engagementRate * 12 + reachFactor * 25 + Math.min(avgComments / 50, 15)),
        );
        return { username: p.username, followers: p.followers, avgLikes, avgComments, engagementRate, growthScore };
      })
      .sort((a, b) => b.engagementRate - a.engagementRate);

    const keywords = extractKeywords(posts);

    const ai = await callAI(profiles, posts);

    const pillarCounts = new Map<Pillar, number>(PILLARS.map((p) => [p, 0]));
    const validPillars = new Set<string>(PILLARS);
    (ai.pillarByIndex ?? []).forEach((row) => {
      if (validPillars.has(row.pillar)) {
        const key = row.pillar as Pillar;
        pillarCounts.set(key, (pillarCounts.get(key) ?? 0) + 1);
      }
    });
    const pillars = PILLARS.map((p) => ({ pillar: p, count: pillarCounts.get(p) ?? 0 })).sort(
      (a, b) => b.count - a.count,
    );

    const recommendations: Recommendation[] = (ai.recommendations ?? [])
      .slice(0, 10)
      .map((r) => ({
        hook: String(r.hook ?? ""),
        format: r.format === "Carousel" ? "Carousel" : "Reel",
        cta: String(r.cta ?? ""),
        score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
      }));

    const result: AnalyticsResult = {
      pillars,
      leaderboard,
      opportunities: (ai.opportunities ?? []).slice(0, 10).map(String),
      recommendations,
      keywords,
      postsAnalysed: posts.length,
      generatedAt: Date.now(),
      inputHash,
    };

    await supabaseAdmin
      .from("analytics_cache")
      .upsert({ input_hash: inputHash, result: result as unknown as Record<string, unknown> }, { onConflict: "input_hash" });

    return result;
  });
