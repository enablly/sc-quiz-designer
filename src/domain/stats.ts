import { orderedOptions } from "./scoring.js";
import type { QuizDefinition, QuizStatus, SubmissionDocument } from "../types.js";

export interface BandStat {
  band: number;
  label: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

export interface AreaStat {
  key: string;
  name: string;
  averagePct: number;
  averageScore: number;
  maxScore: number;
  biggestGapCount: number;
  biggestGapPct: number;
}

export interface OptionStat {
  code?: string;
  text: string;
  points?: number;
  count: number;
  pct: number;
  isMostPicked: boolean;
}

export interface QuestionStat {
  id: string;
  kind: "profile" | "scored";
  areaKey?: string;
  areaName?: string;
  label: string;
  totalAnswered: number;
  totalResponses: number;
  averagePoints?: number;
  maxPoints?: number;
  options: OptionStat[];
}

export interface QuizStatsResponse {
  slug: string;
  title: string;
  status: QuizStatus;
  publicPath: string;
  totalCompletions: number;
  totalAttempts: number;
  averageReadinessPct: number;
  averageTotalPoints: number;
  maxPoints: number;
  bands: BandStat[];
  areas: AreaStat[];
  profileQuestions: QuestionStat[];
  scoredQuestions: QuestionStat[];
}

export function computeQuizStats(
  quiz: QuizDefinition,
  submissions: SubmissionDocument[],
): QuizStatsResponse {
  const totalCompletions = submissions.length;
  const totalAttempts = submissions.reduce(
    (sum, s) => sum + (typeof s.attempt_count === "number" ? s.attempt_count : 1),
    0,
  );

  const areaMaxByKey: Record<string, number> = {};
  for (const a of quiz.areas) {
    areaMaxByKey[a.key] = 0;
  }
  let maxPoints = 0;
  for (const sq of quiz.scoredQuestions) {
    const qMax = sq.options.reduce((m, o) => Math.max(m, o.points), 0);
    maxPoints += qMax;
    areaMaxByKey[sq.area] = (areaMaxByKey[sq.area] ?? 0) + qMax;
  }

  const sumPct = submissions.reduce(
    (sum, s) => sum + (s.result?.readinessPct ?? 0),
    0,
  );
  const sumPts = submissions.reduce(
    (sum, s) => sum + (s.result?.totalPoints ?? 0),
    0,
  );

  const averageReadinessPct =
    totalCompletions > 0 ? Math.round(sumPct / totalCompletions) : 0;
  const averageTotalPoints =
    totalCompletions > 0
      ? Math.round((sumPts / totalCompletions) * 10) / 10
      : 0;

  // 1. Distribution across the bands
  const sortedBands = [...quiz.scoring.bands].sort((a, b) => a.band - b.band);
  const bands: BandStat[] = sortedBands.map((b) => {
    const count = submissions.filter((s) => s.result?.band?.band === b.band).length;
    const pct = totalCompletions > 0 ? Math.round((count / totalCompletions) * 100) : 0;
    return {
      band: b.band,
      label: b.label,
      min: b.min,
      max: b.max,
      count,
      pct,
    };
  });

  // 2. Average score per area
  const areas: AreaStat[] = quiz.areas.map((a) => {
    const sumAreaPct = submissions.reduce(
      (sum, s) => sum + (s.result?.areaPcts?.[a.key] ?? 0),
      0,
    );
    const sumAreaScore = submissions.reduce(
      (sum, s) => sum + (s.result?.areaScores?.[a.key] ?? 0),
      0,
    );
    const biggestGapCount = submissions.filter((s) =>
      Array.isArray(s.result?.biggestGap) && s.result.biggestGap.includes(a.key),
    ).length;

    return {
      key: a.key,
      name: a.name,
      averagePct:
        totalCompletions > 0 ? Math.round(sumAreaPct / totalCompletions) : 0,
      averageScore:
        totalCompletions > 0
          ? Math.round((sumAreaScore / totalCompletions) * 10) / 10
          : 0,
      maxScore: areaMaxByKey[a.key] ?? 0,
      biggestGapCount,
      biggestGapPct:
        totalCompletions > 0
          ? Math.round((biggestGapCount / totalCompletions) * 100)
          : 0,
    };
  });

  // 3. Per-question breakdown: profile questions
  const profileQuestions: QuestionStat[] = quiz.profileQuestions.map((pq, idx) => {
    const counts = pq.options.map((opt) => {
      const codeNorm = opt.code.trim().toLowerCase();
      const textNorm = opt.text.trim().toLowerCase();
      return submissions.filter((s) => {
        const val = String(s.profile?.[pq.id] ?? "").trim().toLowerCase();
        return val !== "" && (val === codeNorm || val === textNorm);
      }).length;
    });

    const totalAnswered = counts.reduce((acc, c) => acc + c, 0);
    const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);

    const options: OptionStat[] = pq.options.map((opt, oi) => {
      const count = counts[oi] ?? 0;
      const pct = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
      return {
        code: opt.code,
        text: opt.text,
        count,
        pct,
        isMostPicked: maxCount > 0 && count === maxCount,
      };
    });

    return {
      id: pq.id,
      kind: "profile",
      label: pq.label || `Profile Question ${idx + 1}`,
      totalAnswered,
      totalResponses: totalAnswered,
      options,
    };
  });

  // 4. Per-question breakdown: scored questions
  const areaNameByKey = new Map(quiz.areas.map((a) => [a.key, a.name]));
  const scoredQuestions: QuestionStat[] = quiz.scoredQuestions.map((sq) => {
    const ordered = orderedOptions(sq);
    const counts = ordered.map((opt) =>
      submissions.filter((s) => s.answers?.[sq.id] === opt.text).length,
    );
    const totalAnswered = counts.reduce((acc, c) => acc + c, 0);
    const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);
    const qMaxPts = sq.options.reduce((m, o) => Math.max(m, o.points), 0);
    const sumPoints = ordered.reduce(
      (sum, opt, oi) => sum + opt.points * (counts[oi] ?? 0),
      0,
    );
    const averagePoints =
      totalAnswered > 0 ? Math.round((sumPoints / totalAnswered) * 10) / 10 : 0;

    const options: OptionStat[] = ordered.map((opt, oi) => {
      const count = counts[oi] ?? 0;
      const pct = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
      return {
        text: opt.text,
        points: opt.points,
        count,
        pct,
        isMostPicked: maxCount > 0 && count === maxCount,
      };
    });

    return {
      id: sq.id,
      kind: "scored",
      areaKey: sq.area,
      areaName: areaNameByKey.get(sq.area) ?? sq.area,
      label: sq.text,
      totalAnswered,
      totalResponses: totalAnswered,
      averagePoints,
      maxPoints: qMaxPts,
      options,
    };
  });

  return {
    slug: quiz.slug,
    title: quiz.title,
    status: quiz.status,
    publicPath: `/q/${encodeURIComponent(quiz.slug)}`,
    totalCompletions,
    totalAttempts,
    averageReadinessPct,
    averageTotalPoints,
    maxPoints,
    bands,
    areas,
    profileQuestions,
    scoredQuestions,
  };
}
