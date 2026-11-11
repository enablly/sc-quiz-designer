import type { QuizDefinition, ScoringBand } from "../types.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: QuizDefinition;
}

function normalizeBand(raw: ScoringBand): ScoringBand {
  const min = typeof raw.min === "number" ? raw.min : Number(raw.minPct);
  const max = typeof raw.max === "number" ? raw.max : Number(raw.maxPct);
  return {
    band: Number(raw.band),
    min,
    max,
    label: String(raw.label ?? "").trim(),
    headline: String(raw.headline ?? "").trim(),
    body: String(raw.body ?? "").trim(),
  };
}

export function normalizeQuizDefinition(input: QuizDefinition): QuizDefinition {
  const clone: QuizDefinition = structuredClone(input);
  clone.slug = String(clone.slug ?? "").trim().toLowerCase();
  clone.title = String(clone.title ?? "").trim();
  clone.subtitle = String(clone.subtitle ?? "").trim();
  clone.status = clone.status === "published" ? "published" : "draft";
  clone.schemaVersion = Number(clone.schemaVersion || 1);
  clone.theme = {
    accent: String(clone.theme?.accent || "#6b4fbb").trim(),
    headerText: String(clone.theme?.headerText || "").trim(),
    logoUrl: clone.theme?.logoUrl ? String(clone.theme.logoUrl).trim() : "",
  };
  clone.consent = {
    textVersion: String(clone.consent?.textVersion || "").trim(),
    text: String(clone.consent?.text || "").trim(),
  };
  clone.sources = Array.isArray(clone.sources)
    ? clone.sources.map((s) => String(s).trim()).filter(Boolean)
    : [];
  clone.profileQuestions = Array.isArray(clone.profileQuestions)
    ? clone.profileQuestions.map((pq) => ({
        id: String(pq.id ?? "").trim(),
        ...(pq.label !== undefined ? { label: String(pq.label).trim() } : {}),
        options: Array.isArray(pq.options)
          ? pq.options.map((o) => ({
              code: String(o.code ?? "").trim(),
              text: String(o.text ?? "").trim(),
            }))
          : [],
      }))
    : [];
  clone.areas = Array.isArray(clone.areas)
    ? clone.areas.map((a) => ({
        key: String(a.key ?? "").trim(),
        name: String(a.name ?? "").trim(),
      }))
    : [];
  clone.scoredQuestions = Array.isArray(clone.scoredQuestions)
    ? clone.scoredQuestions.map((sq) => ({
        id: String(sq.id ?? "").trim(),
        area: String(sq.area ?? "").trim(),
        text: String(sq.text ?? "").trim(),
        ...(sq.displayOrder !== undefined ? { displayOrder: [...sq.displayOrder] } : {}),
        options: Array.isArray(sq.options)
          ? sq.options.map((o) => ({
              points: Number(o.points),
              text: String(o.text ?? "").trim(),
            }))
          : [],
      }))
    : [];
  clone.scoring = {
    scoringVersion: String(clone.scoring?.scoringVersion || "v1-equal").trim(),
    bands: Array.isArray(clone.scoring?.bands)
      ? clone.scoring.bands.map(normalizeBand)
      : [],
    gapCopy: clone.scoring?.gapCopy ?? {},
    fallbackParagraphs: clone.scoring?.fallbackParagraphs ?? {},
    priorityRule: {
      bandsAtOrBelow: Number(clone.scoring?.priorityRule?.bandsAtOrBelow ?? 2),
      roleIds: clone.scoring?.priorityRule?.roleIds ?? ["p1"],
      roleValues: Array.isArray(clone.scoring?.priorityRule?.roleValues)
        ? clone.scoring.priorityRule.roleValues.map((v) => String(v))
        : [],
      sizeIds: clone.scoring?.priorityRule?.sizeIds ?? ["p3"],
      sizeValues: Array.isArray(clone.scoring?.priorityRule?.sizeValues)
        ? clone.scoring.priorityRule.sizeValues.map((v) => String(v))
        : [],
    },
  };
  clone.closing = {
    livePhase: clone.closing?.livePhase === "post" ? "post" : "pre",
    preEvent: String(clone.closing?.preEvent || "").trim(),
    postEvent: String(clone.closing?.postEvent || "").trim(),
  };
  clone.integration = {
    hubspot: {
      mappingStyle: String(clone.integration?.hubspot?.mappingStyle || "hybrid-2026").trim(),
      ...(clone.integration?.hubspot?.note ? { note: clone.integration.hubspot.note } : {}),
    },
    gemini: {
      enabled: clone.integration?.gemini?.enabled !== false,
      placement: String(clone.integration?.gemini?.placement || "email-only").trim(),
    },
  };
  return clone;
}

export function validateQuizDefinition(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Quiz definition must be a JSON object."] };
  }

  const def = normalizeQuizDefinition(raw as QuizDefinition);
  const errors: string[] = [];

  if (!def.slug || !SLUG_RE.test(def.slug)) {
    errors.push("Slug must be non-empty lowercase alphanumeric words separated by hyphens (e.g. 'hybrid-meeting-readiness').");
  }
  if (!def.title) errors.push("Title is required.");
  if (!def.consent.textVersion || !def.consent.text) {
    errors.push("Consent textVersion and text are required.");
  }
  if (!HEX_COLOR_RE.test(def.theme.accent)) {
    errors.push(`Theme accent '${def.theme.accent}' must be a 6-digit hex color like #6b4fbb.`);
  }

  // Validate areas
  if (def.areas.length === 0) {
    errors.push("At least one scoring area is required.");
  }
  const areaKeys = new Set<string>();
  for (const area of def.areas) {
    if (!area.key) {
      errors.push("Every area must have a non-empty key.");
      continue;
    }
    if (areaKeys.has(area.key)) {
      errors.push(`Duplicate area key '${area.key}'.`);
    }
    areaKeys.add(area.key);
    if (!area.name) {
      errors.push(`Area '${area.key}' must have a display name.`);
    }
  }

  // Validate unique question IDs across profileQuestions and scoredQuestions
  const questionIds = new Set<string>();

  for (const pq of def.profileQuestions) {
    if (!pq.id) {
      errors.push("Every profile question must have a non-empty id.");
    } else if (questionIds.has(pq.id)) {
      errors.push(`Duplicate question id '${pq.id}'.`);
    } else {
      questionIds.add(pq.id);
    }

    if (!pq.options || pq.options.length === 0) {
      errors.push(`Profile question '${pq.id || "(unnamed)"}' must have at least one option.`);
    } else {
      const seenTexts = new Set<string>();
      for (const opt of pq.options) {
        if (!opt.code || !opt.text) {
          errors.push(`Profile question '${pq.id}' has an option missing code or text.`);
        }
        if (seenTexts.has(opt.text)) {
          errors.push(`Profile question '${pq.id}' has duplicate option text '${opt.text}'.`);
        }
        seenTexts.add(opt.text);
      }
    }
  }

  if (def.scoredQuestions.length === 0) {
    errors.push("At least one scored question is required.");
  }

  for (const sq of def.scoredQuestions) {
    if (!sq.id) {
      errors.push("Every scored question must have a non-empty id.");
    } else if (questionIds.has(sq.id)) {
      errors.push(`Duplicate question id '${sq.id}'.`);
    } else {
      questionIds.add(sq.id);
    }

    if (!sq.text) {
      errors.push(`Scored question '${sq.id || "(unnamed)"}' must have question text.`);
    }
    if (!sq.area || !areaKeys.has(sq.area)) {
      errors.push(`Scored question '${sq.id || "(unnamed)"}' references unknown area '${sq.area}'.`);
    }

    if (!sq.options || sq.options.length === 0) {
      errors.push(`Scored question '${sq.id || "(unnamed)"}' must have at least one option.`);
    } else {
      const seenTexts = new Set<string>();
      for (const opt of sq.options) {
        if (!opt.text) {
          errors.push(`Scored question '${sq.id}' has an option with empty text.`);
        }
        if (!Number.isFinite(opt.points)) {
          errors.push(`Scored question '${sq.id}' option '${opt.text}' has invalid points.`);
        }
        if (seenTexts.has(opt.text)) {
          errors.push(`Scored question '${sq.id}' has duplicate option text '${opt.text}'.`);
        }
        seenTexts.add(opt.text);
      }

      if (sq.displayOrder && sq.displayOrder.length > 0) {
        for (const entry of sq.displayOrder) {
          if (typeof entry === "number") {
            if (!Number.isInteger(entry) || entry < 0 || entry >= sq.options.length) {
              errors.push(`Scored question '${sq.id}' displayOrder index ${entry} is out of bounds.`);
            }
          } else if (typeof entry === "string") {
            if (!seenTexts.has(entry)) {
              errors.push(`Scored question '${sq.id}' displayOrder references unknown option '${entry}'.`);
            }
          } else {
            errors.push(`Scored question '${sq.id}' has invalid displayOrder entry.`);
          }
        }
      }
    }
  }

  // Validate bands cover 0-100 without gaps or overlaps
  const bands = def.scoring.bands;
  if (bands.length === 0) {
    errors.push("At least one scoring band is required.");
  } else {
    const bandNumbers = new Set<number>();
    for (const b of bands) {
      if (!Number.isInteger(b.band) || b.band < 1) {
        errors.push(`Band number '${b.band}' must be a positive integer.`);
      } else if (bandNumbers.has(b.band)) {
        errors.push(`Duplicate band number ${b.band}.`);
      }
      bandNumbers.add(b.band);

      if (!Number.isFinite(b.min) || !Number.isFinite(b.max) || b.min > b.max) {
        errors.push(`Band ${b.band} has invalid range [${b.min}, ${b.max}].`);
      }
      if (!b.label) {
        errors.push(`Band ${b.band} must have a label.`);
      }
    }

    const sorted = [...bands].sort((a, b) => a.min - b.min);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first && first.min !== 0) {
      errors.push(`Scoring bands must start at 0% (found minimum ${first.min}%).`);
    }
    if (last && last.max !== 100) {
      errors.push(`Scoring bands must end at 100% (found maximum ${last.max}%).`);
    }
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (curr.min <= prev.max) {
        errors.push(`Scoring bands ${prev.band} (${prev.min}-${prev.max}) and ${curr.band} (${curr.min}-${curr.max}) overlap.`);
      } else if (curr.min !== prev.max + 1) {
        errors.push(`Gap in scoring bands between ${prev.max}% (band ${prev.band}) and ${curr.min}% (band ${curr.band}).`);
      }
    }
  }

  return errors.length === 0
    ? { valid: true, errors: [], normalized: def }
    : { valid: false, errors };
}
