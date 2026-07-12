import { createServerFn } from "@tanstack/react-start";

export interface ScoutPost {
  caption: string;
  likes: number;
  comments: number;
}

export interface ScoutProfile {
  username: string;
  followers: number;
  following: number;
  postsCount: number;
  biography: string;
  latestPosts: ScoutPost[];
}

export interface ScoutResult {
  profiles: ScoutProfile[];
  totalPosts: number;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const fetchScoutData = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScoutResult> => {
    const token = process.env.APIFY_API_TOKEN;
    const datasetId = process.env.APIFY_DATASET_ID;
    if (!token) throw new Error("APIFY_API_TOKEN not configured");
    if (!datasetId) throw new Error("APIFY_DATASET_ID not configured");

    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Apify request failed: ${res.status}`);
    }
    const items = (await res.json()) as any[];

    const profiles: ScoutProfile[] = items.map((it) => {
      const posts = Array.isArray(it.latestPosts) ? it.latestPosts : [];
      return {
        username: String(it.username ?? it.ownerUsername ?? "unknown"),
        followers: toNum(it.followersCount ?? it.followers),
        following: toNum(it.followsCount ?? it.following),
        postsCount: toNum(it.postsCount ?? posts.length),
        biography: String(it.biography ?? ""),
        latestPosts: posts.slice(0, 6).map((p: any) => ({
          caption: String(p.caption ?? ""),
          likes: toNum(p.likesCount ?? p.likes),
          comments: toNum(p.commentsCount ?? p.comments),
        })),
      };
    });

    const totalPosts = profiles.reduce(
      (sum, p) => sum + (p.latestPosts.length || p.postsCount),
      0,
    );

    return { profiles, totalPosts };
  },
);
