import type { QuizDefinition } from "../types.js";
import { orderedOptions } from "../domain/scoring.js";
import { repairMojibake } from "../domain/validator.js";

export interface RenderQuizOptions {
  turnstileSiteKey: string;
  submitEndpoint: string;
  previewMode?: boolean;
  standalone?: boolean;
}

export function escapeHtml(str: string): string {
  return repairMojibake(String(str))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonForHtml(value: unknown): string {
  return repairMojibake(JSON.stringify(value))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Compute readable black/white foreground hex for a 6-digit hex background (WCAG relative luminance). */
export function contrastForegroundHex(hex: string): string {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#6b4fbb";
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.17913 ? "#111827" : "#ffffff";
}

function defaultProfileLabel(id: string, index: number): string {
  const defaults: Record<string, string> = {
    p1: "What best describes your role?",
    p2: "Which industry are you in?",
    p3: "How many people work at your primary office or campus?",
    p4: "Which market are you based in?",
  };
  return defaults[id] ?? `Profile question ${index + 1}`;
}

export function renderQuizHtml(
  quiz: QuizDefinition,
  opts: RenderQuizOptions,
): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(quiz.theme.accent)
    ? quiz.theme.accent
    : "#6b4fbb";
  const accentFg = contrastForegroundHex(accent);

  const totalQuestionCount =
    quiz.profileQuestions.length + quiz.scoredQuestions.length;
  const estMinutes = Math.max(2, Math.round(totalQuestionCount * 0.15));
  const areaCount = quiz.areas.length;
  const roadmapText = `~${estMinutes} minutes \u00b7 ${areaCount} ${
    areaCount === 1 ? "area" : "areas"
  } \u00b7 ${totalQuestionCount} questions \u00b7 get your readiness score and biggest gap at the end`;

  const gapCopy = quiz.scoring.gapCopy ?? {};
  const clientQuizPayload = {
    slug: quiz.slug,
    title: quiz.title,
    subtitle: quiz.subtitle,
    consent: quiz.consent,
    sources: quiz.sources,
    profileQuestions: quiz.profileQuestions.map((pq, idx) => ({
      id: pq.id,
      label: pq.label?.trim() || defaultProfileLabel(pq.id, idx),
      options: pq.options,
    })),
    areas: quiz.areas.map((a) => ({
      key: a.key,
      name: a.name,
      blurb: a.blurb?.trim() || gapCopy[a.key]?.tip || "",
    })),
    scoredQuestions: quiz.scoredQuestions.map((sq) => ({
      id: sq.id,
      area: sq.area,
      text: sq.text,
      options: orderedOptions(sq).map((o) => ({
        text: o.text,
        ...(opts.previewMode ? { points: o.points } : {}),
      })),
    })),
    ...(opts.previewMode ? { scoring: quiz.scoring } : {}),
    closing: {
      livePhase: quiz.closing.livePhase === "post" ? "post" : "pre",
      preEvent: quiz.closing.preEvent,
      postEvent: quiz.closing.postEvent,
    },
  };

  const turnstileScript = opts.previewMode
    ? ""
    : `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;

  const logoHtml =
    quiz.theme.logoUrl && /^https?:\/\//i.test(quiz.theme.logoUrl)
      ? `<img class="brand-logo" src="${escapeHtml(quiz.theme.logoUrl)}" alt="${escapeHtml(
          quiz.theme.headerText || quiz.title,
        )}">`
      : "";

  const areaPillsHtml = quiz.areas
    .map(
      (a, idx) =>
        `<li class="welcome-area-pill"><span class="welcome-area-num">${idx + 1}</span><span>${escapeHtml(
          a.name,
        )}</span></li>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(quiz.title)}</title>
${turnstileScript}
<style>
  :root {
    --accent: ${accent};
    --accent-fg: ${accentFg};
    --accent-soft: color-mix(in srgb, var(--accent) 10%, #ffffff);
    --accent-border: color-mix(in srgb, var(--accent) 32%, #ffffff);
    --bg: #f6f7fb;
    --surface: #ffffff;
    --text: #111827;
    --muted: #4b5563;
    --border: #d1d5db;
    --error: #c5221f;
    --error-bg: #fce8e6;
    --warn-bg: #fef7e0;
    --warn-border: #e37400;
    --radius: 14px;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
    background: var(--bg);
    color: var(--text);
    accent-color: var(--accent);
    -webkit-font-smoothing: antialiased;
  }
  .visually-hidden:where(:not(:focus-within, :active)) {
    position: absolute !important;
    clip-path: inset(50%) !important;
    overflow: hidden !important;
    width: 1px !important;
    height: 1px !important;
    margin: -1px !important;
    padding: 0 !important;
    border: 0 !important;
    white-space: nowrap !important;
  }
  .site-header {
    background: var(--accent);
    color: var(--accent-fg);
    padding: 0.9rem 1.25rem;
  }
  @supports (color: color(from red xyz-d65 1 1 1)) {
    .site-header, .btn-primary, .band-pill, .opt-card.is-selected .opt-badge {
      --wcag-y: max(0, sign(0.17913 - y));
      color: color(from var(--accent) xyz-d65 calc(var(--wcag-y) * 0.9505) var(--wcag-y) calc(var(--wcag-y) * 1.089));
    }
  }
  @supports (color: contrast-color(red)) {
    .site-header, .btn-primary, .band-pill, .opt-card.is-selected .opt-badge {
      color: contrast-color(var(--accent));
    }
  }
  .header-inner {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .brand-logo { max-height: 32px; width: auto; }
  .header-kicker {
    font-weight: 600;
    font-size: 0.95rem;
    letter-spacing: 0.01em;
  }
  main {
    max-width: 720px;
    margin: 1.5rem auto 3.5rem;
    padding: 0 1rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid #e5e7eb;
    border-radius: var(--radius);
    padding: 1.5rem;
    box-shadow: 0 6px 24px rgb(17 24 39 / 0.06);
    overflow: hidden;
  }
  @media (min-width: 600px) {
    .card { padding: 2.25rem; }
  }
  h1, h2, h3 { line-height: 1.25; margin-top: 0; }
  h1:focus, h2:focus, legend:focus { outline: none; }
  h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  .co-brand {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin: 0 0 0.35rem;
  }
  .subtitle { color: var(--muted); margin: 0 0 1.25rem; font-size: 1rem; }

  /* 1. Welcome screen roadmap & areas */
  .roadmap-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--accent-soft, #f3f0ff);
    border: 1px solid var(--accent-border, #d6ccff);
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 600;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    margin-bottom: 1.15rem;
  }
  .welcome-areas-title {
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin: 0 0 0.5rem;
  }
  .welcome-areas {
    list-style: none;
    padding: 0;
    margin: 0 0 1.35rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .welcome-area-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
  }
  .welcome-area-num {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font-size: 0.75rem;
    font-weight: 700;
  }

  /* 2. Area-segmented progress bar (transform: scaleX only) */
  .progress-wrap {
    margin-bottom: 1.5rem;
  }
  .progress-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: 0.55rem;
    font-weight: 600;
    flex-wrap: wrap;
  }
  .seg-grid {
    display: grid;
    grid-template-columns: repeat(var(--area-count, 5), minmax(0, 1fr));
    gap: 0.35rem;
    align-items: start;
  }
  .seg-item {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    min-width: 0;
  }
  .seg-track {
    height: 7px;
    background: #e5e7eb;
    border-radius: 999px;
    overflow: hidden;
    position: relative;
  }
  .seg-item.is-current .seg-track {
    box-shadow: 0 0 0 1.5px var(--accent);
  }
  .seg-fill {
    width: 100%;
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transform-origin: left center;
    transform: scaleX(var(--seg-scale, 0));
    transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
  }
  .seg-label {
    font-size: 0.72rem;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: var(--muted);
    white-space: normal;
    overflow-wrap: break-word;
    font-weight: 500;
  }
  @media (max-width: 560px) {
    .seg-grid {
      gap: 0.25rem;
    }
    .seg-label {
      font-size: 0.64rem;
      line-height: 1.15;
      letter-spacing: -0.02em;
    }
  }
  .seg-item.is-current .seg-label {
    color: var(--accent);
    font-weight: 700;
  }

  /* 3. Section-intro card */
  .section-intro-box {
    background: var(--accent-soft, #f3f0ff);
    border: 1.5px solid var(--accent-border, #d6ccff);
    border-radius: 12px;
    padding: 1.5rem;
    margin: 0.5rem 0 1.25rem;
  }
  .section-intro-kicker {
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin: 0 0 0.35rem;
  }
  .section-intro-title {
    font-size: 1.45rem;
    margin: 0 0 0.6rem;
  }
  .section-intro-blurb {
    font-size: 1.05rem;
    color: var(--text);
    margin: 0;
  }

  /* 4. Reactive answer cards */
  fieldset.option-fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1.25rem;
  }
  fieldset.option-fieldset legend {
    font-size: 1.3rem;
    font-weight: 700;
    margin-bottom: 1.1rem;
    padding: 0;
    width: 100%;
  }
  .options-list {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .opt-card {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.9rem 1rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    min-height: 56px;
    cursor: pointer;
    background: #ffffff;
    transition: transform 180ms ease, opacity 180ms ease, border-color 180ms ease, background-color 180ms ease;
    user-select: none;
  }
  .opt-card:hover {
    border-color: var(--accent);
    background: #fafafe;
  }
  .opt-card:focus-within {
    outline: 3px solid #0b57d0;
    outline-offset: 2px;
  }
  .opt-badge {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1.5px solid var(--border);
    background: #f9fafb;
    color: var(--text);
    font-weight: 700;
    font-size: 0.88rem;
    flex-shrink: 0;
    transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
  }
  .opt-text {
    flex: 1;
    font-size: 1rem;
    font-weight: 500;
  }
  .opt-check {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    display: inline-grid;
    place-items: center;
    font-size: 0.85rem;
    font-weight: 800;
    opacity: 0;
    transform: scale(0.6);
    transition: opacity 180ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
    flex-shrink: 0;
  }
  .opt-card.is-selected {
    border-color: var(--accent);
    background: var(--accent-soft, #f4f1fc);
  }
  .opt-card.is-selected .opt-text {
    font-weight: 600;
  }
  .opt-card.is-selected .opt-badge {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-fg);
  }
  .opt-card.is-selected .opt-check {
    opacity: 1;
    transform: scale(1);
  }
  .options-list.is-locking .opt-card:not(.is-selected) {
    opacity: 0.48;
  }
  .kbd-hint {
    font-size: 0.8rem;
    color: var(--muted);
    margin-top: 0.5rem;
  }

  /* 5. Step transitions (slide + fade, 280 ms, transform/opacity only) */
  @keyframes stepSlideForward {
    from { opacity: 0; transform: translateX(18px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes stepSlideBack {
    from { opacity: 0; transform: translateX(-18px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .step-anim-forward {
    animation: stepSlideForward 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .step-anim-back {
    animation: stepSlideBack 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* Consent & Identity forms */
  .consent-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 1rem;
    font-size: 0.92rem;
    color: var(--muted);
  }
  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.8rem 0.9rem;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    min-height: 48px;
    font-weight: 500;
  }
  .checkbox-row input[type="checkbox"] {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    flex-shrink: 0;
  }
  .prefill-banner {
    background: var(--accent-soft, #f3f0ff);
    border: 1px solid var(--accent-border, #d6ccff);
    border-radius: 10px;
    padding: 0.85rem 1rem;
    margin-bottom: 1.25rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    padding: 0.4rem 0.5rem;
    min-height: 44px;
    font-size: inherit;
  }
  .field {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    margin-bottom: 1.15rem;
  }
  .field label { font-weight: 600; font-size: 0.95rem; }
  .hint { color: var(--muted); font-size: 0.85rem; }
  .field input[type="text"],
  .field input[type="email"] {
    font: inherit;
    font-size: max(1rem, 1em);
    padding: 0.7rem 0.85rem;
    min-height: 48px;
    border: 1.5px solid #767676;
    border-radius: 8px;
    background: #ffffff;
    color: var(--text);
  }
  :is(.field input:user-invalid, .field input.user-invalid-fallback) {
    border-color: var(--error);
    background-color: var(--error-bg);
  }
  .field input:user-valid { border-color: #188038; }
  .error-msg {
    display: none;
    color: var(--error);
    font-size: 0.875rem;
    margin-top: 0.15rem;
  }
  :is(.field input:user-invalid, .field input.user-invalid-fallback) + .error-msg {
    display: block;
  }
  .inline-error {
    color: var(--error);
    background: var(--error-bg);
    border: 1px solid #f2b8b5;
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    margin-bottom: 1rem;
    font-size: 0.92rem;
  }
  .soft-warning {
    background: var(--warn-bg);
    border: 1px solid var(--warn-border);
    color: #5f370e;
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    font-size: 0.875rem;
    margin-top: 0.35rem;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
    flex-wrap: wrap;
  }
  .btn {
    font: inherit;
    font-weight: 600;
    min-height: 48px;
    padding: 0.7rem 1.4rem;
    border-radius: 10px;
    border: 1.5px solid transparent;
    cursor: pointer;
  }
  .btn:focus-visible, input:focus-visible, .link-btn:focus-visible {
    outline: 3px solid #0b57d0;
    outline-offset: 2px;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--accent-fg);
    margin-inline-start: auto;
  }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-secondary {
    background: #ffffff;
    border-color: var(--border);
    color: var(--text);
  }
  .turnstile-wrap { margin: 1rem 0; }
  .preview-badge {
    display: inline-block;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    padding: 0.2rem 0.65rem;
    margin-bottom: 0.75rem;
  }

  /* 6. Animated results reveal */
  .score-hero {
    text-align: center;
    padding: 1.5rem 1.25rem;
    background: #f8f7fc;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    margin-bottom: 1.75rem;
  }
  .score-ring-wrap {
    position: relative;
    width: 140px;
    height: 140px;
    margin: 0 auto 0.6rem;
    display: grid;
    place-items: center;
  }
  .score-ring-svg {
    width: 140px;
    height: 140px;
    transform: rotate(-90deg);
  }
  .score-ring-track {
    fill: none;
    stroke: #e5e7eb;
    stroke-width: 10;
  }
  .score-ring-arc {
    fill: none;
    stroke: var(--accent);
    stroke-width: 10;
    stroke-linecap: round;
    stroke-dasharray: 314.16;
    stroke-dashoffset: var(--ring-offset, 314.16);
    transition: stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .score-pct {
    position: absolute;
    font-size: 2.15rem;
    font-weight: 800;
    color: var(--accent);
    line-height: 1;
  }
  .reveal-fade {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 320ms ease-out, transform 320ms ease-out;
  }
  .reveal-fade.is-pre {
    opacity: 0;
    transform: translateY(8px);
  }
  .band-pill {
    display: inline-block;
    margin-top: 0.25rem;
    padding: 0.3rem 0.85rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .area-row {
    margin-bottom: 0.95rem;
    opacity: 1;
    transform: translateY(0);
    transition: opacity 280ms ease-out, transform 280ms ease-out;
    transition-delay: var(--stagger, 0ms);
  }
  .area-row.is-pre {
    opacity: 0;
    transform: translateY(8px);
  }
  .area-row-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.92rem;
    font-weight: 600;
    margin-bottom: 0.3rem;
  }
  .area-bar-track {
    height: 10px;
    background: #e5e7eb;
    border-radius: 999px;
    overflow: hidden;
  }
  .area-bar-fill {
    width: 100%;
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transform-origin: left center;
    transform: scaleX(var(--bar-scale, 0));
    transition: transform 650ms cubic-bezier(0.22, 1, 0.36, 1);
    transition-delay: var(--stagger, 0ms);
    will-change: transform;
  }
  .gap-section {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 350ms ease-out, transform 350ms ease-out;
  }
  .gap-section.is-pre {
    opacity: 0;
    transform: translateY(10px);
  }
  .gap-card {
    border: 1.5px solid var(--accent-border, #d6ccff);
    border-left: 5px solid var(--accent);
    background: var(--accent-soft, #f8f6ff);
    padding: 1.15rem;
    border-radius: 10px;
    margin-bottom: 0.85rem;
  }
  .gap-badge {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
    margin-bottom: 0.25rem;
  }
  .gap-card h3 { margin-bottom: 0.3rem; font-size: 1.08rem; }
  .closing-box {
    margin-top: 1.35rem;
    padding: 1rem 1.15rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-weight: 500;
  }
  [hidden] { display: none !important; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      transition-delay: 0ms !important;
      scroll-behavior: auto !important;
    }
    .reveal-fade.is-pre,
    .area-row.is-pre,
    .gap-section.is-pre {
      opacity: 1 !important;
      transform: none !important;
    }
  }
</style>
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      ${logoHtml}
      <span class="header-kicker">${escapeHtml(quiz.theme.headerText || quiz.title)}</span>
    </div>
  </header>

  <main>
    <div id="aria-announcer" class="visually-hidden" aria-live="polite"></div>

    <section id="app" class="card" aria-live="off">
      ${opts.previewMode ? `<span class="preview-badge">Builder Live Preview (client-side simulation)</span>` : ""}

      <!-- Area-segmented progress bar -->
      <div id="progress-container" class="progress-wrap" hidden>
        <div class="progress-meta">
          <span id="progress-label"></span>
          <span id="progress-overall"></span>
        </div>
        <div id="seg-grid" class="seg-grid" style="--area-count: ${Math.max(1, quiz.areas.length)}"></div>
      </div>

      <div id="step-error" class="inline-error" role="alert" hidden></div>

      <!-- 1. Welcome + Consent screen -->
      <form id="consent-view" hidden novalidate>
        <p class="co-brand">${escapeHtml(quiz.subtitle)}</p>
        <h1 id="welcome-heading" tabindex="-1">${escapeHtml(quiz.title)}</h1>
        <div id="welcome-roadmap" class="roadmap-pill">${escapeHtml(roadmapText)}</div>

        <p class="welcome-areas-title">Areas covered</p>
        <ul class="welcome-areas" aria-label="Assessment areas">
          ${areaPillsHtml}
        </ul>

        <div id="prefill-consent-banner" class="prefill-banner" hidden>
          <span id="prefill-summary"></span>
          <button type="button" id="not-you-btn-1" class="link-btn">Not you?</button>
        </div>

        <div class="consent-box">
          <p style="margin:0">${escapeHtml(quiz.consent.text)}</p>
        </div>

        <label class="checkbox-row" for="consent-checkbox">
          <input type="checkbox" id="consent-checkbox" required>
          <span>I have read and agree to the terms above.</span>
        </label>

        <div class="actions">
          <button type="submit" class="btn btn-primary" enterkeyhint="next">Start assessment</button>
        </div>
      </form>

      <!-- 3. Section-Intro card (before the first question of each scored area) -->
      <div id="section-intro-view" hidden>
        <div class="section-intro-box">
          <p id="intro-kicker" class="section-intro-kicker"></p>
          <h2 id="intro-heading" class="section-intro-title" tabindex="-1"></h2>
          <p id="intro-blurb" class="section-intro-blurb"></p>
        </div>
        <div class="actions">
          <button type="button" id="intro-back-btn" class="btn btn-secondary" enterkeyhint="previous">Back</button>
          <button type="button" id="intro-continue-btn" class="btn btn-primary" enterkeyhint="next">Continue</button>
        </div>
      </div>

      <!-- 4. Question screen with reactive answer cards -->
      <form id="question-view" hidden novalidate>
        <fieldset class="option-fieldset">
          <legend id="question-legend" tabindex="-1"></legend>
          <div id="question-options" class="options-list"></div>
          <div class="kbd-hint" aria-hidden="true">Tip: Press A&ndash;D to select, or Enter to continue.</div>
        </fieldset>
        <div class="actions">
          <button type="button" id="q-back-btn" class="btn btn-secondary" enterkeyhint="previous">Back</button>
          <button type="submit" id="q-next-btn" class="btn btn-primary" enterkeyhint="next">Next</button>
        </div>
      </form>

      <!-- Identity + Turnstile -->
      <form id="identity-view" hidden novalidate>
        <h2 id="identity-heading" tabindex="-1">Where should we send your report?</h2>
        <p class="subtitle">Enter your details to unlock your readiness breakdown.</p>

        <div id="prefill-identity-banner" class="prefill-banner" hidden>
          <span id="prefill-identity-text"></span>
          <button type="button" id="not-you-btn-2" class="link-btn">Not you?</button>
        </div>

        <div id="identity-fields">
          <div class="field">
            <label for="id-fn">First name <span aria-hidden="true">*</span></label>
            <input type="text" id="id-fn" name="firstName" autocomplete="given-name" required data-error="err-fn">
            <div id="err-fn" class="error-msg"><span role="img" aria-label="Error">!</span> Please enter your first name.</div>
          </div>

          <div class="field">
            <label for="id-ln">Last name</label>
            <input type="text" id="id-ln" name="lastName" autocomplete="family-name">
          </div>

          <div class="field">
            <label for="id-em">Work email <span aria-hidden="true">*</span></label>
            <span id="email-hint" class="hint">Format: name@company.com</span>
            <input type="email" id="id-em" name="email" autocomplete="email" autocorrect="off" autocapitalize="none" spellcheck="false" required aria-describedby="email-hint" data-error="err-em">
            <div id="err-em" class="error-msg"><span role="img" aria-label="Error">!</span> Enter a valid email address like name@company.com.</div>
            <div id="free-email-warn" class="soft-warning" hidden>
              Heads up: it looks like a personal email address. Using your work email ensures your team report routes properly, though you can still submit with this address.
            </div>
          </div>

          <div class="field">
            <label for="id-co">Company <span aria-hidden="true">*</span></label>
            <input type="text" id="id-co" name="company" autocomplete="organization" required data-error="err-co">
            <div id="err-co" class="error-msg"><span role="img" aria-label="Error">!</span> Please enter your company name.</div>
          </div>
        </div>

        <div id="turnstile-container" class="turnstile-wrap"></div>

        <div class="actions">
          <button type="button" id="id-back-btn" class="btn btn-secondary" enterkeyhint="previous">Back</button>
          <button type="submit" id="submit-btn" class="btn btn-primary" enterkeyhint="done">See my results</button>
        </div>
      </form>

      <!-- 6. Results screen -->
      <section id="results-view" hidden>
        <h2 id="results-heading" tabindex="-1">Your readiness results</h2>
        <div id="score-hero" class="score-hero">
          <div class="score-ring-wrap">
            <svg class="score-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
              <circle class="score-ring-track" cx="60" cy="60" r="50"></circle>
              <circle id="res-ring-arc" class="score-ring-arc" cx="60" cy="60" r="50"></circle>
            </svg>
            <div id="res-pct" class="score-pct">0%</div>
          </div>
          <div id="res-hero-copy" class="reveal-fade">
            <div id="res-band" class="band-pill"></div>
            <h3 id="res-headline" style="margin-top:0.85rem; margin-bottom:0.4rem;"></h3>
            <p id="res-body" style="margin:0; color:var(--muted);"></p>
          </div>
        </div>

        <h3>Scores by area</h3>
        <div id="res-areas" style="margin-bottom:1.5rem;"></div>

        <div id="res-gap-section" class="gap-section">
          <h3>Biggest gap</h3>
          <div id="res-gaps"></div>
          <div id="res-closing" class="closing-box"></div>
        </div>

        <div class="actions">
          <button type="button" id="retake-btn" class="btn btn-secondary">Retake assessment</button>
        </div>
      </section>
    </section>
  </main>

<script>
(() => {
  const QUIZ = ${safeJsonForHtml(clientQuizPayload)};
  const PREVIEW_MODE = ${opts.previewMode ? "true" : "false"};
  const TURNSTILE_SITE_KEY = ${safeJsonForHtml(opts.turnstileSiteKey)};
  const DEFAULT_SUBMIT_ENDPOINT = ${safeJsonForHtml(opts.submitEndpoint)};
  const FREE_DOMAINS = new Set([
    "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","live.com",
    "aol.com","proton.me","protonmail.com","ymail.com","me.com","msn.com","gmx.com","mail.com"
  ]);
  const RING_CIRC = 314.16;

  const prefersReducedMotion = () =>
    Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const STORAGE_KEY = "sc_quiz_v2_" + QUIZ.slug;
  const totalQuestions = QUIZ.profileQuestions.length + QUIZ.scoredQuestions.length;

  // Build wizard steps: profile questions, then for each area: section-intro + area questions
  const wizardSteps = [];
  let qOverall = 0;

  QUIZ.profileQuestions.forEach((pq, idx) => {
    qOverall += 1;
    wizardSteps.push({
      type: "question",
      kind: "profile",
      id: pq.id,
      text: pq.label,
      options: pq.options,
      areaKey: "__profile__",
      areaName: "About your organisation",
      indexInArea: idx + 1,
      areaTotal: QUIZ.profileQuestions.length,
      overallIndex: qOverall,
      totalQuestions,
    });
  });

  const seenAreas = new Set();
  QUIZ.scoredQuestions.forEach((sq) => {
    const areaObj = QUIZ.areas.find((a) => a.key === sq.area) || { key: sq.area, name: sq.area, blurb: "" };
    const areaQuestions = QUIZ.scoredQuestions.filter((x) => x.area === sq.area);
    const idxInArea = areaQuestions.findIndex((x) => x.id === sq.id) + 1;
    const areaIdx = QUIZ.areas.findIndex((a) => a.key === sq.area) + 1;

    if (!seenAreas.has(sq.area)) {
      seenAreas.add(sq.area);
      wizardSteps.push({
        type: "area-intro",
        areaKey: areaObj.key,
        areaName: areaObj.name,
        areaIndex: areaIdx > 0 ? areaIdx : seenAreas.size,
        totalAreas: QUIZ.areas.length,
        blurb: areaObj.blurb || "",
        areaTotal: areaQuestions.length,
        overallIndex: qOverall + 1,
        totalQuestions,
      });
    }

    qOverall += 1;
    wizardSteps.push({
      type: "question",
      kind: "scored",
      id: sq.id,
      text: sq.text,
      options: sq.options,
      areaKey: areaObj.key,
      areaName: areaObj.name,
      indexInArea: idxInArea,
      areaTotal: areaQuestions.length,
      overallIndex: qOverall,
      totalQuestions,
    });
  });

  function makeUuid() {
    if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "uuid-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  const params = new URLSearchParams(window.location.search);
  const submitEndpoint = params.get("endpoint") || DEFAULT_SUBMIT_ENDPOINT;
  const queryFn = (params.get("fn") || "").trim();
  const queryLn = (params.get("ln") || "").trim();
  const queryEm = (params.get("em") || "").trim();
  const queryCo = (params.get("co") || "").trim();
  const querySrc = (params.get("src") || "").trim();
  const hasPrefill = Boolean(queryFn || queryEm);

  const defaultState = () => ({
    step: -1, // -1 = welcome/consent, 0..wizardSteps.length-1 = steps, wizardSteps.length = identity, wizardSteps.length+1 = results
    consentAccepted: false,
    consentTimestamp: "",
    profile: {},
    answers: {},
    identity: {
      firstName: queryFn,
      lastName: queryLn,
      email: queryEm,
      company: queryCo,
    },
    source: QUIZ.sources.includes(querySrc) ? querySrc : (querySrc || "public"),
    prefilledMode: hasPrefill,
    clientSubmissionId: makeUuid(),
    results: null,
  });

  let state = defaultState();
  if (!PREVIEW_MODE) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        state = { ...defaultState(), ...saved };
        if (hasPrefill && !saved.clearedPrefill) {
          state.identity = {
            firstName: queryFn || state.identity.firstName,
            lastName: queryLn || state.identity.lastName,
            email: queryEm || state.identity.email,
            company: queryCo || state.identity.company,
          };
          if (querySrc) state.source = querySrc;
          state.prefilledMode = true;
        }
      }
    } catch {}
  }

  function persist() {
    if (PREVIEW_MODE) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // DOM refs
  const progressContainer = document.getElementById("progress-container");
  const progressLabel = document.getElementById("progress-label");
  const progressOverall = document.getElementById("progress-overall");
  const segGrid = document.getElementById("seg-grid");
  const stepError = document.getElementById("step-error");

  const consentView = document.getElementById("consent-view");
  const welcomeHeading = document.getElementById("welcome-heading");
  const consentCheckbox = document.getElementById("consent-checkbox");
  const prefillConsentBanner = document.getElementById("prefill-consent-banner");
  const prefillSummary = document.getElementById("prefill-summary");

  const sectionIntroView = document.getElementById("section-intro-view");
  const introKicker = document.getElementById("intro-kicker");
  const introHeading = document.getElementById("intro-heading");
  const introBlurb = document.getElementById("intro-blurb");
  const introBackBtn = document.getElementById("intro-back-btn");
  const introContinueBtn = document.getElementById("intro-continue-btn");

  const questionView = document.getElementById("question-view");
  const questionLegend = document.getElementById("question-legend");
  const questionOptions = document.getElementById("question-options");
  const qBackBtn = document.getElementById("q-back-btn");

  const identityView = document.getElementById("identity-view");
  const identityHeading = document.getElementById("identity-heading");
  const prefillIdentityBanner = document.getElementById("prefill-identity-banner");
  const prefillIdentityText = document.getElementById("prefill-identity-text");
  const identityFields = document.getElementById("identity-fields");
  const fnInput = document.getElementById("id-fn");
  const lnInput = document.getElementById("id-ln");
  const emInput = document.getElementById("id-em");
  const coInput = document.getElementById("id-co");
  const freeEmailWarn = document.getElementById("free-email-warn");
  const idBackBtn = document.getElementById("id-back-btn");
  const submitBtn = document.getElementById("submit-btn");
  const turnstileContainer = document.getElementById("turnstile-container");

  const resultsView = document.getElementById("results-view");
  const resultsHeading = document.getElementById("results-heading");

  let turnstileWidgetId = null;
  let turnstileToken = "";
  let autoAdvanceTimer = null;
  let resultsRafId = null;
  let resultsGapTimer = null;
  let navDirection = "forward";

  // Build segmented area progress DOM once
  const segElements = new Map();
  QUIZ.areas.forEach((a) => {
    const item = document.createElement("div");
    item.className = "seg-item";
    item.innerHTML =
      "<div class=\\"seg-track\\"><div class=\\"seg-fill\\"></div></div>" +
      "<span class=\\"seg-label\\"></span>";
    item.querySelector(".seg-label").textContent = a.name;
    segGrid.append(item);
    segElements.set(a.key, {
      item,
      fill: item.querySelector(".seg-fill"),
    });
  });

  function updateSegmentedProgress(currentStepObj) {
    QUIZ.areas.forEach((a) => {
      const areaQs = QUIZ.scoredQuestions.filter((sq) => sq.area === a.key);
      const answeredCount = areaQs.filter((sq) => Boolean(state.answers[sq.id])).length;
      const ratio = areaQs.length > 0 ? answeredCount / areaQs.length : 0;
      const entry = segElements.get(a.key);
      if (entry) {
        entry.fill.style.setProperty("--seg-scale", String(ratio));
        entry.item.classList.toggle(
          "is-current",
          Boolean(currentStepObj && currentStepObj.areaKey === a.key),
        );
      }
    });

    if (!currentStepObj) return;
    if (currentStepObj.type === "area-intro") {
      progressLabel.textContent =
        currentStepObj.areaName + " \\u00b7 Area " + currentStepObj.areaIndex + " of " + currentStepObj.totalAreas;
      progressOverall.textContent =
        currentStepObj.overallIndex + " of " + currentStepObj.totalQuestions + " overall";
    } else {
      progressLabel.textContent =
        currentStepObj.areaName +
        " \\u00b7 Question " +
        currentStepObj.indexInArea +
        " of " +
        currentStepObj.areaTotal +
        " in this area";
      progressOverall.textContent =
        currentStepObj.overallIndex + " of " + currentStepObj.totalQuestions + " overall";
    }
  }

  function cancelAutoAdvance() {
    if (autoAdvanceTimer !== null) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
  }

  function cancelResultsAnimation() {
    if (resultsRafId !== null) {
      cancelAnimationFrame(resultsRafId);
      resultsRafId = null;
    }
    if (resultsGapTimer !== null) {
      clearTimeout(resultsGapTimer);
      resultsGapTimer = null;
    }
  }

  function showError(msg) {
    if (!msg) {
      stepError.hidden = true;
      stepError.textContent = "";
      return;
    }
    stepError.textContent = msg;
    stepError.hidden = false;
  }

  function applyStepTransition(el) {
    el.classList.remove("step-anim-forward", "step-anim-back");
    if (prefersReducedMotion()) return;
    void el.offsetWidth;
    el.classList.add(navDirection === "back" ? "step-anim-back" : "step-anim-forward");
  }

  function clearPrefill() {
    state.prefilledMode = false;
    state.clearedPrefill = true;
    state.identity = { firstName: "", lastName: "", email: "", company: "" };
    persist();
    render(false);
  }

  document.getElementById("not-you-btn-1").addEventListener("click", clearPrefill);
  document.getElementById("not-you-btn-2").addEventListener("click", clearPrefill);

  function checkFreeEmail() {
    const val = emInput.value.trim().toLowerCase();
    const at = val.indexOf("@");
    const domain = at > -1 ? val.slice(at + 1) : "";
    freeEmailWarn.hidden = !FREE_DOMAINS.has(domain);
  }
  emInput.addEventListener("input", checkFreeEmail);
  emInput.addEventListener("blur", checkFreeEmail);

  // Sync aria-invalid with :user-invalid
  function linkError(el, shown) {
    const errorId = el.dataset.error;
    if (!errorId) return;
    const ids = (el.getAttribute("aria-describedby") || "").split(/\\s+/).filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
    else el.removeAttribute("aria-describedby");
  }
  function syncAria(el) {
    if (!el.matches || !el.matches("input")) return;
    let invalid = false;
    try { invalid = el.matches(":user-invalid"); } catch { invalid = el.classList.contains("user-invalid-fallback"); }
    el.setAttribute("aria-invalid", invalid ? "true" : "false");
    linkError(el, invalid);
  }
  [fnInput, emInput, coInput].forEach((el) => {
    el.setAttribute("aria-invalid", "false");
    el.addEventListener("blur", () => {
      if (!CSS.supports("selector(:user-invalid)")) {
        el.classList.toggle("user-invalid-fallback", !el.validity.valid);
      }
      syncAria(el);
    });
    el.addEventListener("input", () => {
      if (!CSS.supports("selector(:user-invalid)") && el.classList.contains("user-invalid-fallback")) {
        el.classList.toggle("user-invalid-fallback", !el.validity.valid);
      }
      syncAria(el);
    });
  });

  function renderTurnstile() {
    if (PREVIEW_MODE) {
      turnstileContainer.innerHTML = "<p class=\\"hint\\">Turnstile verification skipped in Builder Live Preview.</p>";
      return;
    }
    if (!TURNSTILE_SITE_KEY) {
      turnstileContainer.innerHTML = "<p class=\\"soft-warning\\">Turnstile site key is not configured (TURNSTILE_SITE_KEY).</p>";
      return;
    }
    if (turnstileWidgetId !== null) return;
    if (window.turnstile && typeof window.turnstile.render === "function") {
      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => { turnstileToken = token; },
        "expired-callback": () => { turnstileToken = ""; },
      });
    } else {
      setTimeout(renderTurnstile, 250);
    }
  }

  function selectOptionAndAutoAdvance(stepObj, optionText, cardEl) {
    cancelAutoAdvance();
    if (stepObj.kind === "profile") state.profile[stepObj.id] = optionText;
    else state.answers[stepObj.id] = optionText;
    persist();
    showError("");

    const allCards = questionOptions.querySelectorAll(".opt-card");
    allCards.forEach((c) => c.classList.toggle("is-selected", c === cardEl));
    questionOptions.classList.add("is-locking");
    updateSegmentedProgress(stepObj);

    const delay = prefersReducedMotion() ? 0 : 350;
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null;
      navDirection = "forward";
      state.step += 1;
      persist();
      render(true);
    }, delay);
  }

  function animateResultsReveal(r) {
    cancelResultsAnimation();
    const pctEl = document.getElementById("res-pct");
    const ringArc = document.getElementById("res-ring-arc");
    const heroCopy = document.getElementById("res-hero-copy");
    const gapSection = document.getElementById("res-gap-section");
    const targetPct = Math.max(0, Math.min(100, Math.round(Number(r.readinessPct || 0))));
    const targetOffset = RING_CIRC * (1 - targetPct / 100);

    document.getElementById("score-hero").setAttribute(
      "aria-label",
      "Overall readiness " + targetPct + "%, " + r.band.label,
    );

    if (prefersReducedMotion()) {
      pctEl.textContent = targetPct + "%";
      ringArc.style.setProperty("--ring-offset", String(targetOffset));
      heroCopy.classList.remove("is-pre");
      gapSection.classList.remove("is-pre");
      return;
    }

    // Start strictly at 0% before first paint so no intermediate number flashes
    pctEl.textContent = "0%";
    ringArc.style.setProperty("--ring-offset", String(RING_CIRC));
    heroCopy.classList.add("is-pre");
    gapSection.classList.add("is-pre");

    const duration = 900;
    resultsRafId = requestAnimationFrame(() => {
      resultsRafId = requestAnimationFrame(() => {
        ringArc.style.setProperty("--ring-offset", String(targetOffset));
        heroCopy.classList.remove("is-pre");
        const start = performance.now();
        function tick(now) {
          const elapsed = Math.max(0, now - start);
          const t = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const current = Math.round(eased * targetPct);
          pctEl.textContent = (t < 1 ? current : targetPct) + "%";
          if (t < 1) {
            resultsRafId = requestAnimationFrame(tick);
          } else {
            resultsRafId = null;
          }
        }
        resultsRafId = requestAnimationFrame(tick);
      });
    });

    // Reveal biggest-gap section LAST after the staggered area bars
    const gapDelay = QUIZ.areas.length * 120 + 260;
    resultsGapTimer = setTimeout(() => {
      resultsGapTimer = null;
      gapSection.classList.remove("is-pre");
    }, gapDelay);
  }

  function render(focusHeading = false) {
    cancelAutoAdvance();
    cancelResultsAnimation();
    showError("");
    consentView.hidden = true;
    sectionIntroView.hidden = true;
    questionView.hidden = true;
    identityView.hidden = true;
    resultsView.hidden = true;

    const totalWizardSteps = wizardSteps.length;

    if (state.step < 0) {
      progressContainer.hidden = true;
      consentView.hidden = false;
      applyStepTransition(consentView);
      consentCheckbox.checked = Boolean(state.consentAccepted);
      if (state.prefilledMode && (state.identity.firstName || state.identity.email)) {
        prefillConsentBanner.hidden = false;
        const who = [state.identity.firstName, state.identity.lastName].filter(Boolean).join(" ");
        prefillSummary.textContent =
          "Completing as " + (who || state.identity.email) + (who && state.identity.email ? " (" + state.identity.email + ")" : "");
      } else {
        prefillConsentBanner.hidden = true;
      }
      if (focusHeading) welcomeHeading.focus();
      return;
    }

    if (state.step < totalWizardSteps) {
      progressContainer.hidden = false;
      const stepObj = wizardSteps[state.step];
      updateSegmentedProgress(stepObj);

      if (stepObj.type === "area-intro") {
        sectionIntroView.hidden = false;
        applyStepTransition(sectionIntroView);
        introKicker.textContent = "Area " + stepObj.areaIndex + " of " + stepObj.totalAreas;
        introHeading.textContent = "Area " + stepObj.areaIndex + " of " + stepObj.totalAreas + " \\u2014 " + stepObj.areaName;
        introBlurb.textContent = stepObj.blurb;
        if (focusHeading) introHeading.focus();
        return;
      }

      questionView.hidden = false;
      applyStepTransition(questionView);
      questionLegend.textContent = stepObj.text;
      questionOptions.innerHTML = "";
      questionOptions.classList.remove("is-locking");

      const currentVal = stepObj.kind === "profile" ? state.profile[stepObj.id] : state.answers[stepObj.id];
      stepObj.options.forEach((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const label = document.createElement("label");
        label.className = "opt-card";
        label.dataset.letter = letter;

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "current_q";
        radio.value = opt.text;
        radio.className = "visually-hidden";
        radio.id = "q_opt_" + i;

        const isSelected = currentVal === opt.text || (stepObj.kind === "profile" && currentVal === opt.code);
        if (isSelected) {
          radio.checked = true;
          label.classList.add("is-selected");
        }

        radio.addEventListener("change", () => {
          selectOptionAndAutoAdvance(stepObj, opt.text, label);
        });

        const badge = document.createElement("span");
        badge.className = "opt-badge";
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = letter;

        const textSpan = document.createElement("span");
        textSpan.className = "opt-text";
        textSpan.textContent = opt.text;

        const checkSpan = document.createElement("span");
        checkSpan.className = "opt-check";
        checkSpan.setAttribute("aria-hidden", "true");
        checkSpan.textContent = "\\u2713";

        label.append(radio, badge, textSpan, checkSpan);
        questionOptions.append(label);
      });

      if (focusHeading) questionLegend.focus();
      return;
    }

    if (state.step === totalWizardSteps) {
      progressContainer.hidden = false;
      updateSegmentedProgress(null);
      progressLabel.textContent = "Final step \\u00b7 Your details";
      progressOverall.textContent = totalQuestions + " of " + totalQuestions + " complete";

      identityView.hidden = false;
      applyStepTransition(identityView);
      fnInput.value = state.identity.firstName || "";
      lnInput.value = state.identity.lastName || "";
      emInput.value = state.identity.email || "";
      coInput.value = state.identity.company || "";
      checkFreeEmail();

      if (state.prefilledMode && state.identity.firstName && state.identity.email && state.identity.company) {
        prefillIdentityBanner.hidden = false;
        prefillIdentityText.textContent =
          "Submitting for " + state.identity.firstName + " " + (state.identity.lastName || "") +
          " (" + state.identity.email + ", " + state.identity.company + ")";
        identityFields.hidden = true;
      } else {
        prefillIdentityBanner.hidden = true;
        identityFields.hidden = false;
      }

      renderTurnstile();
      if (focusHeading) identityHeading.focus();
      return;
    }

    // Results screen
    progressContainer.hidden = true;
    const r = state.results;
    if (r) {
      document.getElementById("res-band").textContent = r.band.label;
      const headline = (r.band.headline || "")
        .replace(/\\[X\\]/g, String(r.readinessPct))
        .replace(/\\{pct\\}/g, String(r.readinessPct));
      document.getElementById("res-headline").textContent = headline;
      document.getElementById("res-body").textContent = r.band.body || "";

      const areasEl = document.getElementById("res-areas");
      areasEl.innerHTML = "";
      const reduced = prefersReducedMotion();
      QUIZ.areas.forEach((a, idx) => {
        const pct = r.areaPcts[a.key] ?? 0;
        const row = document.createElement("div");
        row.className = "area-row" + (reduced ? "" : " is-pre");
        row.style.setProperty("--stagger", (idx * 120) + "ms");
        row.innerHTML =
          "<div class=\\"area-row-head\\"><span></span><span></span></div>" +
          "<div class=\\"area-bar-track\\"><div class=\\"area-bar-fill\\"></div></div>";
        const spans = row.querySelectorAll(".area-row-head span");
        spans[0].textContent = a.name;
        spans[1].textContent = pct + "%";
        const fill = row.querySelector(".area-bar-fill");
        fill.style.setProperty("--bar-scale", reduced ? String(pct / 100) : "0");
        areasEl.append(row);
        if (!reduced) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              row.classList.remove("is-pre");
              fill.style.setProperty("--bar-scale", String(pct / 100));
            });
          });
        }
      });

      const gapsEl = document.getElementById("res-gaps");
      gapsEl.innerHTML = "";
      (r.gapCards || []).forEach((g) => {
        const card = document.createElement("div");
        card.className = "gap-card";
        const badge = document.createElement("span");
        badge.className = "gap-badge";
        badge.textContent = "Priority focus area";
        const h3 = document.createElement("h3");
        h3.textContent = g.areaName + " (" + g.pct + "%) \\u2014 " + g.headline;
        const p = document.createElement("p");
        p.style.margin = "0";
        p.textContent = g.tip;
        card.append(badge, h3, p);
        gapsEl.append(card);
      });

      document.getElementById("res-closing").textContent = r.closingLine || "";
      animateResultsReveal(r);
    }
    resultsView.hidden = false;
    applyStepTransition(resultsView);
    if (focusHeading) resultsHeading.focus();
  }

  consentView.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!consentCheckbox.checked) {
      showError("Please confirm your consent before starting the assessment.");
      consentCheckbox.focus();
      return;
    }
    state.consentAccepted = true;
    if (!state.consentTimestamp) state.consentTimestamp = new Date().toISOString();
    navDirection = "forward";
    state.step = 0;
    persist();
    render(true);
  });

  introBackBtn.addEventListener("click", () => {
    navDirection = "back";
    state.step = Math.max(-1, state.step - 1);
    persist();
    render(true);
  });

  introContinueBtn.addEventListener("click", () => {
    navDirection = "forward";
    state.step += 1;
    persist();
    render(true);
  });

  qBackBtn.addEventListener("click", () => {
    cancelAutoAdvance();
    navDirection = "back";
    state.step = Math.max(-1, state.step - 1);
    persist();
    render(true);
  });

  questionView.addEventListener("submit", (e) => {
    e.preventDefault();
    cancelAutoAdvance();
    const stepObj = wizardSteps[state.step];
    const selected = questionView.querySelector("input[name=\\"current_q\\"]:checked");
    if (!selected) {
      showError("Please select an option to continue.");
      return;
    }
    if (stepObj.kind === "profile") state.profile[stepObj.id] = selected.value;
    else state.answers[stepObj.id] = selected.value;
    navDirection = "forward";
    state.step += 1;
    persist();
    render(true);
  });

  // Desktop keyboard support: A-D keys select an option, Enter advances on section-intro
  document.addEventListener("keydown", (e) => {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" && e.target.type !== "radio") return;
    if (tag === "textarea" || tag === "select") return;

    if (state.step >= 0 && state.step < wizardSteps.length) {
      const stepObj = wizardSteps[state.step];
      if (stepObj.type === "area-intro" && e.key === "Enter" && tag !== "button") {
        e.preventDefault();
        introContinueBtn.click();
        return;
      }
      if (stepObj.type === "question") {
        const keyUpper = e.key.toUpperCase();
        if (keyUpper.length === 1 && keyUpper >= "A" && keyUpper <= "Z") {
          const idx = keyUpper.charCodeAt(0) - 65;
          if (idx >= 0 && idx < stepObj.options.length) {
            e.preventDefault();
            const cards = questionOptions.querySelectorAll(".opt-card");
            const card = cards[idx];
            const radio = card ? card.querySelector("input[type=\\"radio\\"]") : null;
            if (radio && card) {
              radio.checked = true;
              selectOptionAndAutoAdvance(stepObj, stepObj.options[idx].text, card);
            }
          }
        }
      }
    }
  });

  idBackBtn.addEventListener("click", () => {
    navDirection = "back";
    state.step = wizardSteps.length - 1;
    persist();
    render(true);
  });

  function computeLocalPreviewResults() {
    const areaScores = {};
    const areaMax = {};
    QUIZ.areas.forEach((a) => { areaScores[a.key] = 0; areaMax[a.key] = 0; });
    let total = 0;
    let maxTotal = 0;
    QUIZ.scoredQuestions.forEach((sq) => {
      const chosen = state.answers[sq.id];
      const opt = sq.options.find((o) => o.text === chosen);
      const pts = opt ? Number(opt.points || 0) : 0;
      const qMax = Math.max(...sq.options.map((o) => Number(o.points || 0)));
      total += pts;
      maxTotal += qMax;
      areaScores[sq.area] = (areaScores[sq.area] || 0) + pts;
      areaMax[sq.area] = (areaMax[sq.area] || 0) + qMax;
    });
    const readinessPct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
    const areaPcts = {};
    QUIZ.areas.forEach((a) => {
      areaPcts[a.key] = areaMax[a.key] > 0 ? Math.round((areaScores[a.key] / areaMax[a.key]) * 100) : 0;
    });
    const minPct = Math.min(...QUIZ.areas.map((a) => areaPcts[a.key]));
    const biggestGap = QUIZ.areas.filter((a) => areaPcts[a.key] === minPct).map((a) => a.key);
    const band = (QUIZ.scoring.bands || []).find((b) => readinessPct >= b.min && readinessPct <= b.max) || { band: 1, label: "Result", headline: "You're at [X]%.", body: "" };
    const gapCopy = QUIZ.scoring.gapCopy || {};
    return {
      readinessPct,
      band,
      areaPcts,
      gapCards: biggestGap.map((k) => ({
        areaKey: k,
        areaName: (QUIZ.areas.find((a) => a.key === k) || {}).name || k,
        pct: areaPcts[k],
        headline: (gapCopy[k] || {}).headline || k,
        tip: (gapCopy[k] || {}).tip || "",
      })),
      closingLine: QUIZ.closing.livePhase === "post" ? QUIZ.closing.postEvent : QUIZ.closing.preEvent,
    };
  }

  identityView.addEventListener("submit", async (e) => {
    e.preventDefault();
    state.identity.firstName = fnInput.value.trim();
    state.identity.lastName = lnInput.value.trim();
    state.identity.email = emInput.value.trim();
    state.identity.company = coInput.value.trim();
    persist();

    if (!identityFields.hidden) {
      const inputs = [fnInput, emInput, coInput];
      let firstBad = null;
      for (const el of inputs) {
        if (!el.checkValidity()) {
          if (!CSS.supports("selector(:user-invalid)")) el.classList.add("user-invalid-fallback");
          syncAria(el);
          if (!firstBad) firstBad = el;
        }
      }
      if (firstBad) {
        firstBad.focus();
        showError("Please check the highlighted fields.");
        return;
      }
    }

    if (PREVIEW_MODE) {
      navDirection = "forward";
      state.results = computeLocalPreviewResults();
      state.step = wizardSteps.length + 1;
      render(true);
      return;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      showError("Please complete the verification check before submitting.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Calculating...";
    showError("");

    try {
      const res = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSubmissionId: state.clientSubmissionId,
          consentAccepted: state.consentAccepted,
          consentTextVersion: QUIZ.consent.textVersion,
          consentTimestamp: state.consentTimestamp,
          firstName: state.identity.firstName,
          lastName: state.identity.lastName,
          email: state.identity.email,
          company: state.identity.company,
          source: state.source,
          profile: state.profile,
          answers: state.answers,
          turnstileToken: turnstileToken || "preview-bypass",
          pageUri: window.location.href,
          hutk: getCookie("hubspotutk"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Could not submit your answers. Please try again.");
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
          turnstileToken = "";
        }
        return;
      }
      navDirection = "forward";
      state.results = data;
      state.step = wizardSteps.length + 1;
      persist();
      render(true);
    } catch {
      showError("Network error while submitting. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "See my results";
    }
  });

  document.getElementById("retake-btn").addEventListener("click", () => {
    navDirection = "back";
    state.step = 0;
    state.results = null;
    state.clientSubmissionId = makeUuid();
    turnstileToken = "";
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    persist();
    render(true);
  });

  render(false);
})();
</script>
</body>
</html>`;
}
