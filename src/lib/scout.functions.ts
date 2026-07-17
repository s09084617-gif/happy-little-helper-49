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

export type ScoutConnectionStatus =
  | "connected"
  | "connected_public"
  | "auth_failed"
  | "dataset_not_found";

export interface ScoutResult {
  profiles: ScoutProfile[];
  totalPosts: number;
  connectionStatus: ScoutConnectionStatus;
  connectionMessage: string;
}

export class ScoutError extends Error {
  status: ScoutConnectionStatus;
  httpStatus?: number;
  constructor(status: ScoutConnectionStatus, message: string, httpStatus?: number) {
    super(message);
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function apifyFetch(datasetId: string, token: string | undefined) {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`;
  // Send token via Authorization header only — never in the query string / client.
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  return res;
}

export const fetchScoutData = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScoutResult> => {
    const token = process.env.APIFY_API_TOKEN;
    const datasetId = process.env.APIFY_DATASET_ID;
    if (!datasetId) {
      throw new ScoutError("dataset_not_found", "APIFY_DATASET_ID not configured");
    }

    let res = await apifyFetch(datasetId, token);
    let usedAuth = Boolean(token);
    let authFailed = false;

    if (res.status === 401 || res.status === 403) {
      const body = await res.clone().text();
      console.error(
        `[Scout] Apify auth failed (${res.status}) with token: ${body.slice(0, 300)}`,
      );
      authFailed = true;
      // Retry unauthenticated — public datasets are readable without a token.
      res = await apifyFetch(datasetId, undefined);
      usedAuth = false;
    }

    if (res.status === 404) {
      const body = await res.text();
      console.error(`[Scout] Apify dataset not found (404): ${body.slice(0, 300)}`);
      throw new ScoutError(
        "dataset_not_found",
        `Apify dataset "${datasetId}" not found`,
        404,
      );
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Scout] Apify request failed (${res.status}): ${body.slice(0, 300)}`);
      if (authFailed) {
        throw new ScoutError(
          "auth_failed",
          "Apify authentication failed — invalid APIFY_API_TOKEN",
          401,
        );
      }
      throw new ScoutError(
        "auth_failed",
        `Apify request failed (${res.status})`,
        res.status,
      );
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

    const connectionStatus: ScoutConnectionStatus = authFailed
      ? "auth_failed"
      : usedAuth
        ? "connected"
        : "connected_public";

    const connectionMessage = authFailed
      ? "APIFY_API_TOKEN is invalid — reading public dataset without auth"
      : usedAuth
        ? "Authenticated with APIFY_API_TOKEN"
        : "Reading public dataset (no APIFY_API_TOKEN set)";

    return { profiles, totalPosts, connectionStatus, connectionMessage };
  },
);
