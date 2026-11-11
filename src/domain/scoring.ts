import type {
  QuizDefinition,
  ScoreResult,
  ScoredOption,
  ScoredQuestion,
  ScoringBand,
} from "../types.js";

/** Return the options for a question in its configured display order. */
export function orderedOptions(q: ScoredQuestion): ScoredOption[] {
  if (!q.displayOrder || q.displayOrder.length === 0) {
    return [...q.options];
  }
  const seen = new Set<string>();
  const ordered: ScoredOption[] = [];
  for (const entry of q.displayOrder) {
    const opt =
      typeof entry === "number"
        ? q.options[entry]
        : q.options.find((o) => o.text === entry);
    if (opt && !seen.has(opt.text)) {
      seen.add(opt.text);
      ordered.push(opt);
    }
  }
  for (const opt of q.options) {
    if (!seen.has(opt.text)) ordered.push(opt);
  }
  return ordered;
}

/** Map a chosen answer text to its points for one question. Throws on unknown text. */
export function pointsForAnswer(
  quiz: QuizDefinition,
  questionId: string,
  answerText: string,
): number {
  const q = quiz.scoredQuestions.find((x) => x.id === questionId);
  if (!q) throw new Error(`unknown question ${questionId}`);
  const opt = q.options.find((o) => o.text === answerText);
  if (!opt) throw new Error(`unknown answer for ${questionId}: ${answerText}`);
  return opt.points;
}

export function bandForPct(quiz: QuizDefinition, pct: number): ScoringBand {
  const b = quiz.scoring.bands.find((x) => {
    const min = typeof x.min === "number" ? x.min : Number(x.minPct);
    const max = typeof x.max === "number" ? x.max : Number(x.maxPct);
    return pct >= min && pct <= max;
  });
  if (!b) throw new Error(`pct out of range: ${pct}`);
  return b;
}

/** Server-side deterministic scoring from submitted answer TEXTS. Client points are never trusted. */
export function scoreAnswers(
  quiz: QuizDefinition,
  answers: Record<string, string>,
): ScoreResult {
  const pointsByQuestion: Record<string, number> = {};
  const areaScores: Record<string, number> = {};
  const areaMaxScores: Record<string, number> = {};

  for (const a of quiz.areas) {
    areaScores[a.key] = 0;
    areaMaxScores[a.key] = 0;
  }

  let maxPoints = 0;
  for (const q of quiz.scoredQuestions) {
    const text = answers[q.id];
    if (typeof text !== "string") {
      throw new Error(`missing answer for ${q.id}`);
    }
    const pts = pointsForAnswer(quiz, q.id, text);
    const qMax = Math.max(...q.options.map((o) => o.points));
    pointsByQuestion[q.id] = pts;
    maxPoints += qMax;
    areaScores[q.area] = (areaScores[q.area] ?? 0) + pts;
    areaMaxScores[q.area] = (areaMaxScores[q.area] ?? 0) + qMax;
  }

  const totalPoints = Object.values(pointsByQuestion).reduce((a, b) => a + b, 0);
  const readinessPct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  const areaPcts: Record<string, number> = {};
  for (const a of quiz.areas) {
    const aMax = areaMaxScores[a.key] ?? 0;
    const aScore = areaScores[a.key] ?? 0;
    areaPcts[a.key] = aMax > 0 ? Math.round((aScore / aMax) * 100) : 0;
  }

  const minAreaPct = Math.min(...quiz.areas.map((a) => areaPcts[a.key] ?? 0));
  const biggestGap = quiz.areas
    .filter((a) => (areaPcts[a.key] ?? 0) === minAreaPct)
    .map((a) => a.key);

  const gapCopy = quiz.scoring.gapCopy ?? {};
  const gapHeadline = biggestGap
    .map((k) => gapCopy[k]?.headline ?? k)
    .join(" + ");
  const gapTip = biggestGap
    .map((k) => gapCopy[k]?.tip ?? "")
    .filter(Boolean)
    .join(" ");

  return {
    pointsByQuestion,
    areaScores,
    areaMaxScores,
    areaPcts,
    totalPoints,
    maxPoints,
    readinessPct,
    band: bandForPct(quiz, readinessPct),
    biggestGap,
    gapHeadline,
    gapTip,
  };
}

/** Resolve a profile answer (code or text) to its display text. */
export function resolveProfileText(
  quiz: QuizDefinition,
  questionId: string,
  value: string,
): string {
  const q = quiz.profileQuestions.find((x) => x.id === questionId);
  const opt = q?.options.find((o) => o.code === value || o.text === value);
  return opt?.text ?? value;
}

/** Priority follow-up flag — rule from quiz definition (band <= threshold AND matching role AND matching size). */
export function priorityFlag(
  quiz: QuizDefinition,
  bandNumber: number,
  profile: Record<string, string>,
): boolean {
  const rule = quiz.scoring.priorityRule;
  if (!rule) return false;
  if (bandNumber > rule.bandsAtOrBelow) return false;

  const roleQId = rule.roleIds?.[0] ?? quiz.profileQuestions[0]?.id ?? "p1";
  const sizeQId = rule.sizeIds?.[0] ?? quiz.profileQuestions[2]?.id ?? "p3";

  const roleRaw = profile[roleQId] ?? "";
  const sizeRaw = profile[sizeQId] ?? "";

  const roleText = resolveProfileText(quiz, roleQId, roleRaw);
  const sizeText = resolveProfileText(quiz, sizeQId, sizeRaw);

  const roleOk =
    rule.roleValues.length === 0 ||
    rule.roleValues.includes(roleRaw) ||
    rule.roleValues.includes(roleText);
  const sizeOk =
    rule.sizeValues.length === 0 ||
    rule.sizeValues.includes(sizeRaw) ||
    rule.sizeValues.includes(sizeText);

  return roleOk && sizeOk;
}

/** Validate a profile answer set (codes or texts both resolvable in definition). */
export function validateProfile(
  quiz: QuizDefinition,
  profile: Record<string, string>,
): void {
  for (const q of quiz.profileQuestions) {
    const v = profile[q.id];
    if (
      typeof v !== "string" ||
      !q.options.some((o) => o.code === v || o.text === v)
    ) {
      throw new Error(`invalid profile answer for ${q.id}`);
    }
  }
}

export function renderFallbackParagraph(
  quiz: QuizDefinition,
  r: ScoreResult,
): string {
  const template =
    quiz.scoring.fallbackParagraphs?.[String(r.band.band)] ??
    "Your overall readiness is {pct}% ({band}). Your biggest opportunity is {gapNames}. {gapTip}";

  const areaNameByKey = new Map(quiz.areas.map((a) => [a.key, a.name]));
  const gapNames = r.biggestGap
    .map((k) => areaNameByKey.get(k) ?? k)
    .join(" and ");

  const sortedAreas = [...quiz.areas].sort(
    (a, b) => (r.areaPcts[b.key] ?? 0) - (r.areaPcts[a.key] ?? 0),
  );
  const bestArea = sortedAreas[0];
  const bestAreaName = bestArea ? bestArea.name : "";
  const bestPct = bestArea ? (r.areaPcts[bestArea.key] ?? 0) : r.readinessPct;
  const gapPct = r.biggestGap[0] ? (r.areaPcts[r.biggestGap[0]] ?? 0) : 0;

  return template
    .replaceAll("{pct}", String(r.readinessPct))
    .replaceAll("{score}", String(r.readinessPct))
    .replaceAll("{band}", r.band.label)
    .replaceAll("{bandLabel}", r.band.label)
    .replaceAll("{gapNames}", gapNames)
    .replaceAll("{gapArea}", gapNames)
    .replaceAll("{gapPct}", String(gapPct))
    .replaceAll("{bestArea}", bestAreaName)
    .replaceAll("{bestPct}", String(bestPct))
    .replaceAll("{gapTip}", r.gapTip)
    .replaceAll("{tip}", r.gapTip);
}
