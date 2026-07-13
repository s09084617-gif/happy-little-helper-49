import { createServerFn } from "@tanstack/react-start";
import { fetchScoutData, type ScoutProfile } from "./scout.functions";

export type Pillar =
  | "Fat Loss"
  | "Muscle Gain"
  | "Nutrition"
  | "Mindset"
  | "Client Transformation"
  | "Workout Tips"
  | "Lifestyle"
  | "Educational";

export const PILLARS: Pillar[] = [
  "Fat Loss",
  "Muscle Gain",
  "Nutrition",
  "Mindset",
  "Client Transformation",
  "Workout Tips",
  "Lifestyle",
  "Educational",
];

export interface TopHook {
  hook: string;
  username: string;
  likes: number;
  comments: number;
  engagement: number;
}

export interface LeaderboardRow {
  username: string;
  followers: number;
  avgLikes: number;
  avgComments: number;
  engagementRate: number;
}

export interface AnalyticsResult {
  hooks: TopHook[];
  pillars: { pillar: Pillar; count: number }[];
  leaderboard: LeaderboardRow[];
  opportunities: string[];
  recommendations: string[];
  postsAnalysed: number;
  generatedAt: number;
}

function firstSentence(caption: string): string {
  const trimmed = caption.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const match = trimmed.match(/^.*?[.!?\n](?=\s|$)/);
  const raw = match ? match[0] : trimmed;
  return raw.length > 140 ? raw.slice(0, 137) + "…" : raw;
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

interface AiResponse {
  pillarByIndex: { index: number; pillar: string }[];
  opportunities: string[];
  recommendations: string[];
}

async function callAI(profiles: ScoutProfile[], posts: FlatPost[]): Promise<AiResponse> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const compactPosts = posts.map((p) => ({
    i: p.index,
    u: p.username,
    c: p.caption.slice(0, 280),
    l: p.likes,
    cm: p.comments,
  }));

  const profileSummary = profiles.map((p) => ({
    username: p.username,
    followers: p.followers,
    bio: (p.biography ?? "").slice(0, 200),
  }));

  const system = `You are a senior Instagram content strategist for a fitness coach named Sahil.
You analyse competitor Instagram posts and return ONLY valid JSON matching the requested schema.
Never include prose, markdown, or code fences.`;

  const user = `Analyse these Instagram competitor posts.

Competitor profiles:
${JSON.stringify(profileSummary)}

Posts (i=index, u=username, c=caption, l=likes, cm=comments):
${JSON.stringify(compactPosts)}

Return JSON with this exact shape:
{
  "pillarByIndex": [ { "index": <number>, "pillar": <one of: "Fat Loss","Muscle Gain","Nutrition","Mindset","Client Transformation","Workout Tips","Lifestyle","Educational"> } ],
  "opportunities": [ 5 short actionable strings about content gaps and trends you notice across competitors ],
  "recommendations": [ 10 specific Instagram content ideas tailored for Sahil (a fitness coach) based on competitor gaps ]
}

Rules:
- pillarByIndex MUST include every post index exactly once.
- Pick the single best-fitting pillar per post.
- Opportunities must be concrete observations (e.g. "Transformation reels get 2x engagement — post more client wins").
- Recommendations must be specific post ideas Sahil can create this week, not generic advice.
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

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: AiResponse;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to salvage the first {...} block
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned invalid JSON");
    parsed = JSON.parse(match[0]);
  }
  return parsed;
}

export const analyzeScoutData = createServerFn({ method: "POST" }).handler(
  async (): Promise<AnalyticsResult> => {
    const scout = await fetchScoutData();
    const profiles = scout.profiles;
    const posts = flatten(profiles);

    if (posts.length === 0) {
      return {
        hooks: [],
        pillars: PILLARS.map((p) => ({ pillar: p, count: 0 })),
        leaderboard: [],
        opportunities: [],
        recommendations: [],
        postsAnalysed: 0,
        generatedAt: Date.now(),
      };
    }

    // Deterministic: top hooks
    const hooks: TopHook[] = posts
      .map((p) => ({
        hook: firstSentence(p.caption),
        username: p.username,
        likes: p.likes,
        comments: p.comments,
        engagement: p.likes + p.comments * 2,
      }))
      .filter((h) => h.hook.length > 0)
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10);

    // Deterministic: leaderboard
    const leaderboard: LeaderboardRow[] = profiles
      .map((p) => {
        const n = p.latestPosts.length || 1;
        const totalLikes = p.latestPosts.reduce((s, x) => s + (x.likes ?? 0), 0);
        const totalComments = p.latestPosts.reduce((s, x) => s + (x.comments ?? 0), 0);
        const avgLikes = totalLikes / n;
        const avgComments = totalComments / n;
        const engagementRate =
          p.followers > 0 ? ((avgLikes + avgComments) / p.followers) * 100 : 0;
        return {
          username: p.username,
          followers: p.followers,
          avgLikes,
          avgComments,
          engagementRate,
        };
      })
      .sort((a, b) => b.engagementRate - a.engagementRate);

    // AI: pillars + opportunities + recommendations
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

    return {
      hooks,
      pillars,
      leaderboard,
      opportunities: (ai.opportunities ?? []).slice(0, 5),
      recommendations: (ai.recommendations ?? []).slice(0, 10),
      postsAnalysed: posts.length,
      generatedAt: Date.now(),
    };
  },
);
