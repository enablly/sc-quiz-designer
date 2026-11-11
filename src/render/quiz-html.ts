import type { QuizDefinition } from "../types.js";
import { orderedOptions } from "../domain/scoring.js";

export interface RenderQuizOptions {
  turnstileSiteKey: string;
  submitEndpoint: string;
  previewMode?: boolean;
  standalone?: boolean;
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
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
    areas: quiz.areas,
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

  const turnstileScript =
    opts.previewMode
      ? ""
      : `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;

  const logoHtml =
    quiz.theme.logoUrl && /^https?:\/\//i.test(quiz.theme.logoUrl)
      ? `<img class="brand-logo" src="${escapeHtml(quiz.theme.logoUrl)}" alt="${escapeHtml(quiz.theme.headerText || quiz.title)}">`
      : "";

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
    --bg: #f6f7fb;
    --surface: #ffffff;
    --text: #111827;
    --muted: #4b5563;
    --border: #d1d5db;
    --error: #c5221f;
    --error-bg: #fce8e6;
    --warn-bg: #fef7e0;
    --warn-border: #e37400;
    --radius: 12px;
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
    .site-header, .btn-primary {
      --wcag-y: max(0, sign(0.17913 - y));
      color: color(from var(--accent) xyz-d65 calc(var(--wcag-y) * 0.9505) var(--wcag-y) calc(var(--wcag-y) * 1.089));
    }
  }
  @supports (color: contrast-color(red)) {
    .site-header, .btn-primary {
      color: contrast-color(var(--accent));
    }
  }
  .header-inner {
    max-width: 700px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .brand-logo {
    max-height: 32px;
    width: auto;
  }
  .header-kicker {
    font-weight: 600;
    font-size: 0.95rem;
    letter-spacing: 0.01em;
  }
  main {
    max-width: 700px;
    margin: 1.5rem auto 3rem;
    padding: 0 1rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid #e5e7eb;
    border-radius: var(--radius);
    padding: 1.5rem;
    box-shadow: 0 4px 16px rgb(17 24 39 / 0.05);
  }
  @media (min-width: 600px) {
    .card { padding: 2rem; }
  }
  h1, h2, h3 { line-height: 1.25; margin-top: 0; }
  h1 { font-size: 1.6rem; margin-bottom: 0.35rem; }
  .subtitle { color: var(--muted); margin: 0 0 1.25rem; font-size: 1rem; }
  .progress-wrap {
    margin-bottom: 1.25rem;
  }
  .progress-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    color: var(--muted);
    margin-bottom: 0.35rem;
    font-weight: 500;
  }
  progress {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
  }
  @supports not (accent-color: var(--accent)) {
    progress { -webkit-appearance: none; appearance: none; border: none; background: #e5e7eb; }
    progress::-webkit-progress-bar { background: #e5e7eb; border-radius: 999px; }
    progress::-webkit-progress-value { background: var(--accent); border-radius: 999px; }
    progress::-moz-progress-bar { background: var(--accent); border-radius: 999px; }
  }
  .consent-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    font-size: 0.95rem;
  }
  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    min-height: 48px;
  }
  .checkbox-row input[type="checkbox"] {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    flex-shrink: 0;
  }
  .prefill-banner {
    background: #f3f0ff;
    border: 1px solid #d6ccff;
    border-radius: 8px;
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
    padding: 0.25rem 0.4rem;
    font-size: inherit;
  }
  fieldset.option-fieldset {
    border: none;
    padding: 0;
    margin: 0 0 1.25rem;
  }
  fieldset.option-fieldset legend {
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 1rem;
    padding: 0;
  }
  .options-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .option-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    min-height: 52px;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .option-label:hover { border-color: var(--accent); background: #fafafe; }
  .option-label:has(input:checked) {
    border-color: var(--accent);
    background: #f4f1fc;
    font-weight: 600;
  }
  .option-label input[type="radio"] {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    margin: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    margin-bottom: 1.15rem;
  }
  .field label {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
  }
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
  .field input:user-valid {
    border-color: #188038;
  }
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
    padding: 0.7rem 1.35rem;
    border-radius: 8px;
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
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: #ffffff;
    border-color: var(--border);
    color: var(--text);
  }
  .turnstile-wrap {
    margin: 1rem 0;
  }
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
  .score-hero {
    text-align: center;
    padding: 1.25rem;
    background: #f8f7fc;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    margin-bottom: 1.5rem;
  }
  .score-pct {
    font-size: 2.75rem;
    font-weight: 800;
    color: var(--accent);
    line-height: 1.1;
  }
  .band-pill {
    display: inline-block;
    margin-top: 0.4rem;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .area-row {
    margin-bottom: 0.85rem;
  }
  .area-row-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.92rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .area-bar-track {
    height: 10px;
    background: #e5e7eb;
    border-radius: 999px;
    overflow: hidden;
  }
  .area-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
  }
  .gap-card {
    border-left: 4px solid var(--accent);
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0 8px 8px 0;
    margin-bottom: 0.85rem;
  }
  .gap-card h3 { margin-bottom: 0.25rem; font-size: 1.05rem; }
  .closing-box {
    margin-top: 1.25rem;
    padding: 1rem;
    background: #f3f0ff;
    border-radius: 8px;
    font-weight: 500;
  }
  [hidden] { display: none !important; }
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

      <div id="progress-container" class="progress-wrap" hidden>
        <div class="progress-meta">
          <span id="progress-label">Question 1</span>
          <span id="progress-pct">0%</span>
        </div>
        <progress id="progress-bar" max="100" value="0"></progress>
      </div>

      <div id="step-error" class="inline-error" role="alert" hidden></div>

      <!-- Step: Consent -->
      <form id="consent-view" hidden novalidate>
        <h1 tabindex="-1">${escapeHtml(quiz.title)}</h1>
        <p class="subtitle">${escapeHtml(quiz.subtitle)}</p>

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

      <!-- Step: Question -->
      <form id="question-view" hidden novalidate>
        <fieldset class="option-fieldset">
          <legend id="question-legend" tabindex="-1"></legend>
          <div id="question-options" class="options-list"></div>
        </fieldset>
        <div class="actions">
          <button type="button" id="q-back-btn" class="btn btn-secondary" enterkeyhint="previous">Back</button>
          <button type="submit" id="q-next-btn" class="btn btn-primary" enterkeyhint="next">Next</button>
        </div>
      </form>

      <!-- Step: Identity + Turnstile -->
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

      <!-- Step: Results -->
      <section id="results-view" hidden>
        <h2 id="results-heading" tabindex="-1">Your readiness results</h2>
        <div class="score-hero">
          <div id="res-pct" class="score-pct">0%</div>
          <div id="res-band" class="band-pill"></div>
          <h3 id="res-headline" style="margin-top:0.85rem; margin-bottom:0.4rem;"></h3>
          <p id="res-body" style="margin:0; color:var(--muted);"></p>
        </div>

        <h3>Scores by area</h3>
        <div id="res-areas" style="margin-bottom:1.5rem;"></div>

        <h3>Biggest opportunity</h3>
        <div id="res-gaps"></div>

        <div id="res-closing" class="closing-box"></div>

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

  const STORAGE_KEY = "sc_quiz_" + QUIZ.slug;
  const allQuestions = [
    ...QUIZ.profileQuestions.map((pq) => ({ kind: "profile", id: pq.id, text: pq.label, options: pq.options })),
    ...QUIZ.scoredQuestions.map((sq) => ({ kind: "scored", id: sq.id, text: sq.text, options: sq.options })),
  ];

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
    step: -1, // -1 = consent, 0..N-1 = questions, N = identity, N+1 = results
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
    source: (QUIZ.sources.includes(querySrc) ? querySrc : (querySrc || "public")),
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
  const progressPct = document.getElementById("progress-pct");
  const progressBar = document.getElementById("progress-bar");
  const stepError = document.getElementById("step-error");

  const consentView = document.getElementById("consent-view");
  const consentCheckbox = document.getElementById("consent-checkbox");
  const prefillConsentBanner = document.getElementById("prefill-consent-banner");
  const prefillSummary = document.getElementById("prefill-summary");

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

  function showError(msg) {
    if (!msg) {
      stepError.hidden = true;
      stepError.textContent = "";
      return;
    }
    stepError.textContent = msg;
    stepError.hidden = false;
  }

  function clearPrefill() {
    state.prefilledMode = false;
    state.clearedPrefill = true;
    state.identity = { firstName: "", lastName: "", email: "", company: "" };
    persist();
    render();
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

  function render(focusHeading = false) {
    showError("");
    consentView.hidden = true;
    questionView.hidden = true;
    identityView.hidden = true;
    resultsView.hidden = true;

    const totalQuestions = allQuestions.length;

    if (state.step < 0) {
      progressContainer.hidden = true;
      consentView.hidden = false;
      consentCheckbox.checked = Boolean(state.consentAccepted);
      if (state.prefilledMode && (state.identity.firstName || state.identity.email)) {
        prefillConsentBanner.hidden = false;
        const who = [state.identity.firstName, state.identity.lastName].filter(Boolean).join(" ");
        prefillSummary.textContent = "Completing as " + (who || state.identity.email) + (who && state.identity.email ? " (" + state.identity.email + ")" : "");
      } else {
        prefillConsentBanner.hidden = true;
      }
      if (focusHeading) consentView.querySelector("h1")?.focus();
      return;
    }

    if (state.step < totalQuestions) {
      progressContainer.hidden = false;
      const pct = Math.round(((state.step + 1) / (totalQuestions + 1)) * 100);
      progressLabel.textContent = "Question " + (state.step + 1) + " of " + totalQuestions;
      progressPct.textContent = pct + "%";
      progressBar.value = pct;

      const q = allQuestions[state.step];
      questionView.hidden = false;
      questionLegend.textContent = q.text;
      questionOptions.innerHTML = "";

      const currentVal = q.kind === "profile" ? state.profile[q.id] : state.answers[q.id];
      q.options.forEach((opt, i) => {
        const label = document.createElement("label");
        label.className = "option-label";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "current_q";
        radio.value = opt.text;
        radio.id = "q_opt_" + i;
        if (currentVal === opt.text || (q.kind === "profile" && currentVal === opt.code)) {
          radio.checked = true;
        }
        radio.addEventListener("change", () => {
          if (q.kind === "profile") state.profile[q.id] = opt.text;
          else state.answers[q.id] = opt.text;
          persist();
          showError("");
        });
        const span = document.createElement("span");
        span.textContent = opt.text;
        label.append(radio, span);
        questionOptions.append(label);
      });

      if (focusHeading) questionLegend.focus();
      return;
    }

    if (state.step === totalQuestions) {
      progressContainer.hidden = false;
      progressLabel.textContent = "Final step";
      progressPct.textContent = "95%";
      progressBar.value = 95;

      identityView.hidden = false;
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
    resultsView.hidden = false;
    const r = state.results;
    if (r) {
      document.getElementById("res-pct").textContent = r.readinessPct + "%";
      document.getElementById("res-band").textContent = r.band.label;
      const headline = (r.band.headline || "")
        .replace(/\\[X\\]/g, String(r.readinessPct))
        .replace(/\\{pct\\}/g, String(r.readinessPct));
      document.getElementById("res-headline").textContent = headline;
      document.getElementById("res-body").textContent = r.band.body || "";

      const areasEl = document.getElementById("res-areas");
      areasEl.innerHTML = "";
      QUIZ.areas.forEach((a) => {
        const pct = r.areaPcts[a.key] ?? 0;
        const row = document.createElement("div");
        row.className = "area-row";
        row.innerHTML =
          "<div class=\\"area-row-head\\"><span></span><span></span></div>" +
          "<div class=\\"area-bar-track\\"><div class=\\"area-bar-fill\\"></div></div>";
        const spans = row.querySelectorAll(".area-row-head span");
        spans[0].textContent = a.name;
        spans[1].textContent = pct + "%";
        row.querySelector(".area-bar-fill").style.width = pct + "%";
        areasEl.append(row);
      });

      const gapsEl = document.getElementById("res-gaps");
      gapsEl.innerHTML = "";
      (r.gapCards || []).forEach((g) => {
        const card = document.createElement("div");
        card.className = "gap-card";
        const h3 = document.createElement("h3");
        h3.textContent = g.areaName + " (" + g.pct + "%) — " + g.headline;
        const p = document.createElement("p");
        p.style.margin = "0";
        p.textContent = g.tip;
        card.append(h3, p);
        gapsEl.append(card);
      });

      document.getElementById("res-closing").textContent = r.closingLine || "";
    }
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
    state.step = 0;
    persist();
    render(true);
  });

  qBackBtn.addEventListener("click", () => {
    state.step = Math.max(-1, state.step - 1);
    persist();
    render(true);
  });

  questionView.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = allQuestions[state.step];
    const selected = questionView.querySelector("input[name=\\"current_q\\"]:checked");
    if (!selected) {
      showError("Please select an option to continue.");
      return;
    }
    if (q.kind === "profile") state.profile[q.id] = selected.value;
    else state.answers[q.id] = selected.value;
    state.step += 1;
    persist();
    render(true);
  });

  idBackBtn.addEventListener("click", () => {
    state.step = allQuestions.length - 1;
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
      state.results = computeLocalPreviewResults();
      state.step = allQuestions.length + 1;
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
      state.results = data;
      state.step = allQuestions.length + 1;
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
