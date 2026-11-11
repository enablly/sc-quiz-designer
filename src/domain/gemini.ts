import type { GeminiStatus, QuizDefinition, ScoreResult } from "../types.js";
import { renderFallbackParagraph } from "./scoring.js";

export interface GeminiEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export const GEMINI_SYSTEM_PROMPT = `Write one paragraph, about 80 words (60-110 words hard range), interpreting the pattern across the supplied hybrid-meeting readiness area scores for one respondent.
Rules: use only the supplied numbers, band and tips. No new facts, no statistics, no product names, no product claims, no pricing, no competitor mentions, no promises about the webinar. Recommendations may only restate the supplied gap tip(s) in different words. Second person, encouraging tone, never suggest the reader failed. Output the paragraph only — no heading, no bullet points, no quotation marks.`;

export function buildGeminiPayload(quiz: QuizDefinition, r: ScoreResult) {
  const areaNameByKey = new Map(quiz.areas.map((a) => [a.key, a.name]));
  const areas = quiz.areas
    .map((a) => ({ area: a.name, pct: r.areaPcts[a.key] ?? 0 }))
    .sort((x, y) => y.pct - x.pct);

  const lowestQuestions = quiz.scoredQuestions
    .map((q) => ({
      q: `${q.id.toUpperCase()} ${q.text}`,
      points: r.pointsByQuestion[q.id] ?? 0,
    }))
    .sort((a, b) => a.points - b.points)
    .slice(0, 3);

  const gapCopy = quiz.scoring.gapCopy ?? {};
  return {
    readiness_pct: r.readinessPct,
    band: r.band.label,
    areas,
    biggest_gap: r.biggestGap.map((k) => areaNameByKey.get(k) ?? k),
    lowest_questions: lowestQuestions,
    allowed_tips: r.biggestGap.map((k) => gapCopy[k]?.tip ?? "").filter(Boolean),
  };
}

const BANNED_RE = /(https?:|www\.|\$\s?\d|\b\d{4}\b)/i;

export function validateParagraph(text: string, r: ScoreResult): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 60 || words.length > 110) return false;
  if (/\n/.test(trimmed)) return false;
  if (BANNED_RE.test(trimmed)) return false;
  const allowed = new Set([
    String(r.readinessPct),
    ...Object.values(r.areaPcts).map(String),
  ]);
  const numbers = trimmed.match(/\d+/g) ?? [];
  if (numbers.some((n) => !allowed.has(n))) return false;
  return true;
}

export async function generateParagraph(
  env: GeminiEnv,
  quiz: QuizDefinition,
  r: ScoreResult,
  fetchFn: typeof fetch = fetch,
): Promise<{ text: string; status: GeminiStatus }> {
  const fallback = () => ({
    text: renderFallbackParagraph(quiz, r),
    status: "fallback" as const,
  });

  if (quiz.integration?.gemini?.enabled === false) return fallback();
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return fallback();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: JSON.stringify(buildGeminiPayload(quiz, r)) }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 220 },
        }),
      },
    );
    if (!res.ok) return fallback();
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text || !validateParagraph(text, r)) return fallback();
    return { text, status: "ok" };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
