import { createServerFn } from "@tanstack/react-start";

export interface ScriptContent {
  hooks: string[]; // 3 viral hooks
  reelScript: string; // 45-60s
  shortCaption: string;
  longCaption: string;
  cta: string;
  hashtags: string[]; // 15
  thumbnailTitle: string;
  bRoll: string[];
  voiceover: string;
  watchTimeScore: number; // 0-100
}

export interface ScriptRecord {
  id: string;
  topic: string;
  competitor_inspiration: string | null;
  hook: string;
  script: ScriptContent;
  caption: string;
  hashtags: string[];
  status: "Draft" | "Published";
  created_at: string;
  updated_at: string;
}

interface GenerateInput {
  topic: string;
  format?: "Reel" | "Carousel";
  cta?: string;
  competitorInspiration?: string;
}

async function callAI(input: GenerateInput): Promise<ScriptContent> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const system = `You are an elite Instagram content writer for fitness coach @sahil_r_fitness.
Write in a punchy, confident, direct voice. Return ONLY valid JSON — no prose, no markdown, no code fences.`;

  const user = `Create a complete Instagram content package for this idea.

Topic / Hook idea: ${input.topic}
Preferred format: ${input.format ?? "Reel"}
Suggested CTA: ${input.cta ?? "(pick the strongest one)"}
Competitor inspiration: ${input.competitorInspiration ?? "(none)"}

Return JSON exactly this shape:
{
  "hooks": [3 scroll-stopping first-line hooks, each under 90 chars],
  "reelScript": "A 45-60 second Reel script broken into short beats with timestamps like [0-3s], [3-8s]... covering hook, promise, value, proof, CTA.",
  "shortCaption": "1-2 sentence Instagram caption under 200 chars",
  "longCaption": "Storytelling caption 800-1200 chars with narrative arc, tension, resolution, lesson",
  "cta": "One strong CTA line",
  "hashtags": [15 relevant Instagram hashtags with # prefix, mix of niche + broad fitness tags],
  "thumbnailTitle": "3-5 word bold thumbnail overlay",
  "bRoll": [8-12 concrete B-roll shot descriptions],
  "voiceover": "Voiceover-ready script (spoken words only, no directions)",
  "watchTimeScore": integer 60-100 estimating watch-time retention
}

Rules:
- Every field required.
- hashtags MUST have exactly 15 items, each starting with '#'.
- hooks MUST have exactly 3 items.
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
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
    throw new Error(`AI request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = (() => {
    try {
      return JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI returned invalid JSON");
      return JSON.parse(m[0]);
    }
  })();

  const hooks = Array.isArray(parsed.hooks) ? parsed.hooks.slice(0, 3).map(String) : [];
  while (hooks.length < 3) hooks.push("");

  const rawHashtags: string[] = Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [];
  const hashtags = rawHashtags
    .map((h: string) => (h.startsWith("#") ? h : `#${h}`))
    .slice(0, 15);
  while (hashtags.length < 15) hashtags.push("#fitness");

  const bRoll = Array.isArray(parsed.bRoll) ? parsed.bRoll.map(String) : [];

  return {
    hooks,
    reelScript: String(parsed.reelScript ?? ""),
    shortCaption: String(parsed.shortCaption ?? ""),
    longCaption: String(parsed.longCaption ?? ""),
    cta: String(parsed.cta ?? input.cta ?? ""),
    hashtags,
    thumbnailTitle: String(parsed.thumbnailTitle ?? ""),
    bRoll,
    voiceover: String(parsed.voiceover ?? ""),
    watchTimeScore: Math.max(0, Math.min(100, Math.round(Number(parsed.watchTimeScore) || 75))),
  };
}

export const generateScript = createServerFn({ method: "POST" })
  .inputValidator((data: GenerateInput) => {
    if (!data || typeof data.topic !== "string" || !data.topic.trim()) {
      throw new Error("topic is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ScriptContent> => {
    return callAI(data);
  });

interface SaveInput {
  topic: string;
  competitorInspiration?: string;
  content: ScriptContent;
}

export const saveScript = createServerFn({ method: "POST" })
  .inputValidator((data: SaveInput) => {
    if (!data?.topic || !data?.content) throw new Error("topic and content required");
    return data;
  })
  .handler(async ({ data }): Promise<ScriptRecord> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const primaryHook = data.content.hooks[0] ?? "";
    const { data: row, error } = await supabaseAdmin
      .from("scripts")
      .insert({
        topic: data.topic,
        competitor_inspiration: data.competitorInspiration ?? null,
        hook: primaryHook,
        script: JSON.parse(JSON.stringify(data.content)),
        caption: data.content.shortCaption,
        hashtags: JSON.parse(JSON.stringify(data.content.hashtags)),
        status: "Draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as ScriptRecord;
  });

export const listScripts = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScriptRecord[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("scripts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ScriptRecord[];
  },
);
