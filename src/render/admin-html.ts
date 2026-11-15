import { escapeHtml } from "./quiz-html.js";

export function renderAdminLoginHtml(errorMessage?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quiz Designer — Admin Login</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #f3f4f6;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111827;
  }
  .card {
    width: min(420px, 92vw);
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.06);
  }
  h1 { margin: 0 0 0.35rem; font-size: 1.4rem; }
  p { margin: 0 0 1.25rem; color: #4b5563; font-size: 0.95rem; }
  label { display: block; font-weight: 600; margin-bottom: 0.35rem; font-size: 0.9rem; }
  input {
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 0.75rem;
    font: inherit;
    font-size: 1rem;
    border: 1.5px solid #9ca3af;
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  button {
    width: 100%;
    min-height: 46px;
    font: inherit;
    font-weight: 600;
    background: #6b4fbb;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  .err {
    background: #fce8e6;
    color: #c5221f;
    border: 1px solid #f2b8b5;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
</style>
</head>
<body>
  <main class="card">
    <h1>Quiz Designer Admin</h1>
    <p>Sign in with your admin token to manage quizzes and exports.</p>
    ${errorMessage ? `<div class="err" role="alert">${escapeHtml(errorMessage)}</div>` : ""}
    <form method="POST" action="/api/admin/login">
      <label for="token">Admin Token</label>
      <input type="password" id="token" name="token" required autocomplete="current-password" autofocus>
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

export function renderAdminBuilderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quiz Designer — Builder</title>
<style>
  :root {
    --accent: #6b4fbb;
    --bg: #f3f4f6;
    --surface: #ffffff;
    --border: #d1d5db;
    --text: #111827;
    --muted: #4b5563;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.45;
  }
  .topbar {
    background: #1f2937;
    color: #ffffff;
    padding: 0.75rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .topbar h1 { margin: 0; font-size: 1.1rem; }
  .topbar-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .btn {
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.45rem 0.85rem;
    min-height: 36px;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #111827;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .btn:hover { background: #f9fafb; }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
  .btn-primary:hover { filter: brightness(0.95); background: var(--accent); }
  .btn-danger { background: #dc2626; border-color: #dc2626; color: #ffffff; }
  .btn-sm { padding: 0.25rem 0.55rem; min-height: 28px; font-size: 0.8rem; }
  .layout {
    display: grid;
    grid-template-columns: 280px 1fr 420px;
    min-height: calc(100vh - 54px);
  }
  @media (max-width: 1200px) {
    .layout { grid-template-columns: 260px 1fr; }
    .preview-pane { grid-column: 1 / -1; min-height: 600px; border-top: 1px solid var(--border); }
  }
  @media (max-width: 820px) {
    .layout { grid-template-columns: 1fr; }
  }
  .sidebar {
    background: #ffffff;
    border-right: 1px solid var(--border);
    padding: 1rem;
    overflow-y: auto;
  }
  .quiz-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 0.65rem;
    cursor: pointer;
  }
  .quiz-item.active {
    border-color: var(--accent);
    background: #f5f3ff;
  }
  .quiz-item-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    text-transform: uppercase;
  }
  .badge-published { background: #dcfce7; color: #166534; }
  .badge-draft { background: #fef3c7; color: #92400e; }
  .quiz-item-actions {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    margin-top: 0.55rem;
  }
  .editor-pane {
    padding: 1rem 1.25rem 3rem;
    overflow-y: auto;
  }
  .editor-toolbar {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    position: sticky;
    top: 0.5rem;
    z-index: 10;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }
  .tab-btn {
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: #ffffff;
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .tab-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
  }
  .panel {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .field { margin-bottom: 0.85rem; }
  .field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem; }
  .field input[type="text"],
  .field input[type="number"],
  .field input[type="url"],
  .field select,
  .field textarea {
    width: 100%;
    padding: 0.45rem 0.6rem;
    font: inherit;
    font-size: 0.9rem;
    border: 1px solid #9ca3af;
    border-radius: 6px;
  }
  .field textarea { min-height: 82px; resize: vertical; }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
  .subcard {
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    border-radius: 8px;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .subcard-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .opt-row {
    display: grid;
    grid-template-columns: 90px 1fr auto;
    gap: 0.4rem;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .preview-pane {
    background: #e5e7eb;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
  .preview-head {
    background: #ffffff;
    border-bottom: 1px solid var(--border);
    padding: 0.6rem 0.85rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .preview-frame {
    width: 100%;
    flex: 1;
    border: none;
    background: #f6f7fb;
  }
  .banner {
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  .banner-error { background: #fce8e6; color: #b91c1c; border: 1px solid #fecaca; }
  .banner-ok { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
  .muted { color: var(--muted); font-size: 0.82rem; }
  dialog {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem;
    max-width: 560px;
    width: 92vw;
  }
  dialog::backdrop { background: rgb(0 0 0 / 0.45); }
  [hidden] { display: none !important; }
</style>
</head>
<body>
  <header class="topbar">
    <h1>Quiz Designer Builder</h1>
    <div class="topbar-actions">
      <button type="button" id="new-quiz-btn" class="btn btn-primary">+ New Quiz</button>
      <button type="button" id="import-json-btn" class="btn">Import JSON</button>
      <button type="button" id="retry-sweep-btn" class="btn">Run Retry Sweep</button>
      <button type="button" id="logout-btn" class="btn">Logout</button>
    </div>
  </header>

  <div class="layout">
    <aside class="sidebar">
      <h2 style="font-size:0.95rem; margin-top:0;">Quizzes</h2>
      <div id="quiz-list"></div>
    </aside>

    <main class="editor-pane">
      <div id="status-banner" class="banner" hidden></div>

      <div id="no-selection" class="panel" hidden>
        <p>Select a quiz from the left or create a new one.</p>
      </div>

      <div id="editor-root" hidden>
        <div class="editor-toolbar">
          <div>
            <strong id="editing-title">Quiz</strong>
            <div class="muted" id="editing-slug"></div>
          </div>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            <button type="button" id="save-btn" class="btn btn-primary">Validate &amp; Save</button>
            <button type="button" id="export-json-btn" class="btn">Export JSON</button>
            <button type="button" id="export-html-btn" class="btn">Export Standalone HTML</button>
            <a id="export-csv-link" class="btn" href="#">Export CSV</a>
            <a id="open-live-link" class="btn" href="#" target="_blank" rel="noopener">Open Live</a>
          </div>
        </div>

        <div class="tabs" id="editor-tabs">
          <button type="button" class="tab-btn active" data-tab="meta">Meta &amp; Theme</button>
          <button type="button" class="tab-btn" data-tab="copy">Page Copy &amp; CTA</button>
          <button type="button" class="tab-btn" data-tab="consent">Consent</button>
          <button type="button" class="tab-btn" data-tab="profile">Profile Questions</button>
          <button type="button" class="tab-btn" data-tab="areas">Areas &amp; Gap Copy</button>
          <button type="button" class="tab-btn" data-tab="questions">Scored Questions</button>
          <button type="button" class="tab-btn" data-tab="scoring">Bands, Fallbacks &amp; Rules</button>
          <button type="button" class="tab-btn" data-tab="closing">Closing &amp; Integrations</button>
          <button type="button" class="tab-btn" data-tab="responses">Responses</button>
          <button type="button" class="tab-btn" data-tab="revisions">Revisions &amp; JSON</button>
        </div>

        <div id="tab-content"></div>
      </div>
    </main>

    <section class="preview-pane">
      <div class="preview-head">
        <span>Live Preview</span>
        <button type="button" id="refresh-preview-btn" class="btn btn-sm">Refresh Preview</button>
      </div>
      <iframe id="preview-frame" class="preview-frame" title="Quiz Live Preview"></iframe>
    </section>
  </div>

  <dialog id="import-dialog">
    <h3 style="margin-top:0;">Import Quiz Definition JSON</h3>
    <div class="field">
      <label for="import-file">Choose .json file</label>
      <input type="file" id="import-file" accept="application/json,.json">
    </div>
    <div class="field">
      <label for="import-textarea">Or paste JSON</label>
      <textarea id="import-textarea" style="min-height:180px; font-family:monospace; font-size:0.8rem;"></textarea>
    </div>
    <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
      <button type="button" id="import-cancel-btn" class="btn">Cancel</button>
      <button type="button" id="import-confirm-btn" class="btn btn-primary">Import &amp; Save</button>
    </div>
  </dialog>

  <dialog id="standalone-dialog">
    <h3 style="margin-top:0;">Export Standalone HTML</h3>
    <p class="muted">The exported HTML file has inline CSS/JS and zero external assets except Cloudflare Turnstile and your submit endpoint.</p>
    <div class="field">
      <label for="standalone-endpoint">Submit API Endpoint URL</label>
      <input type="url" id="standalone-endpoint">
    </div>
    <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
      <button type="button" id="standalone-cancel-btn" class="btn">Cancel</button>
      <button type="button" id="standalone-download-btn" class="btn btn-primary">Download .html</button>
    </div>
  </dialog>

  <dialog id="confirm-dialog">
    <h3 style="margin-top:0;" id="confirm-title">Confirm</h3>
    <p id="confirm-message"></p>
    <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
      <button type="button" id="confirm-cancel-btn" class="btn">Cancel</button>
      <button type="button" id="confirm-ok-btn" class="btn btn-danger">Delete</button>
    </div>
  </dialog>

<script>
(() => {
  let quizzes = [];
  let currentSlug = null;
  let draft = null;
  let revisions = [];
  let activeTab = "meta";
  let previewTimer = null;

  const statusBanner = document.getElementById("status-banner");
  const quizListEl = document.getElementById("quiz-list");
  const editorRoot = document.getElementById("editor-root");
  const noSelection = document.getElementById("no-selection");
  const tabContent = document.getElementById("tab-content");
  const previewFrame = document.getElementById("preview-frame");

  function showBanner(msg, isError = false) {
    statusBanner.hidden = false;
    statusBanner.className = "banner " + (isError ? "banner-error" : "banner-ok");
    statusBanner.textContent = msg;
  }

  function clearBanner() {
    statusBanner.hidden = true;
    statusBanner.textContent = "";
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      throw new Error("Unauthorized");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.errors ? data.errors.join(" | ") : (data.error || "Request failed");
      throw new Error(msg);
    }
    return data;
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 250);
  }

  async function refreshPreview() {
    if (!draft) return;
    try {
      const res = await fetch("/api/admin/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        previewFrame.srcdoc = await res.text();
      }
    } catch {}
  }

  function createBlankQuiz(slug) {
    return {
      schemaVersion: 1,
      slug,
      title: "New Assessment",
      subtitle: "Subtitle",
      status: "draft",
      theme: { accent: "#6b4fbb", headerText: "Assessment", logoUrl: "" },
      consent: { textVersion: "consent-v1", text: "I agree to share my answers to receive my assessment results." },
      sources: ["public", "email", "linkedin"],
      profileQuestions: [
        { id: "p1", label: "What is your role?", options: [{ code: "leader", text: "Leader" }, { code: "other", text: "Other" }] },
        { id: "p2", label: "Industry?", options: [{ code: "tech", text: "Tech" }, { code: "other", text: "Other" }] },
        { id: "p3", label: "Company size?", options: [{ code: "small", text: "Under 500" }, { code: "large", text: "500+" }] },
        { id: "p4", label: "Market?", options: [{ code: "global", text: "Global" }] },
      ],
      areas: [{ key: "general", name: "General Readiness" }],
      scoredQuestions: [
        {
          id: "q1",
          area: "general",
          text: "How ready is your team?",
          displayOrder: [0, 1],
          options: [{ points: 3, text: "Fully ready" }, { points: 0, text: "Not ready" }],
        },
      ],
      scoring: {
        scoringVersion: "v1-equal",
        bands: [
          { band: 1, min: 0, max: 49, label: "Getting started", headline: "You're at [X]%.", body: "Room to grow." },
          { band: 2, min: 50, max: 100, label: "Ready", headline: "You're at [X]%.", body: "Strong foundation." },
        ],
        gapCopy: { general: { headline: "Build core habits", tip: "Start with one clear team ritual." } },
        fallbackParagraphs: {
          "1": "Your overall readiness is {pct}% ({band}). Focus on {gapNames}: {gapTip}",
          "2": "Your overall readiness is {pct}% ({band}). Keep watching {gapNames}: {gapTip}",
        },
        priorityRule: { bandsAtOrBelow: 1, roleIds: ["p1"], roleValues: ["Leader"], sizeIds: ["p3"], sizeValues: ["500+"] },
      },
      closing: { livePhase: "pre", preEvent: "Thank you for completing this assessment.", postEvent: "Thank you for completing this assessment." },
      integration: { hubspot: { mappingStyle: "hybrid-2026" }, gemini: { enabled: true, placement: "email-only" } },
    };
  }

  async function loadQuizzes(selectSlug) {
    quizzes = await api("/api/admin/quizzes");
    renderQuizList();
    const target = selectSlug || currentSlug || quizzes[0]?.slug || null;
    if (target && quizzes.some((q) => q.slug === target)) {
      await selectQuiz(target);
    } else if (quizzes.length === 0) {
      currentSlug = null;
      draft = null;
      editorRoot.hidden = true;
      noSelection.hidden = false;
    }
  }

  async function selectQuiz(slug) {
    clearBanner();
    currentSlug = slug;
    draft = await api("/api/admin/quizzes/" + encodeURIComponent(slug));
    revisions = await api("/api/admin/quizzes/" + encodeURIComponent(slug) + "/revisions");
    editorRoot.hidden = false;
    noSelection.hidden = true;
    renderQuizList();
    renderToolbar();
    renderTab();
    refreshPreview();
  }

  function renderQuizList() {
    quizListEl.innerHTML = "";
    quizzes.forEach((q) => {
      const card = document.createElement("div");
      card.className = "quiz-item" + (q.slug === currentSlug ? " active" : "");
      card.innerHTML =
        "<div class=\\"quiz-item-head\\">" +
          "<div><strong></strong><div class=\\"muted\\"></div></div>" +
          "<span class=\\"badge " + (q.status === "published" ? "badge-published" : "badge-draft") + "\\"></span>" +
        "</div>" +
        "<div class=\\"quiz-item-actions\\"></div>";
      card.querySelector("strong").textContent = q.title;
      card.querySelector(".muted").textContent = "/q/" + q.slug;
      card.querySelector(".badge").textContent = q.status;

      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        selectQuiz(q.slug);
      });

      const actions = card.querySelector(".quiz-item-actions");

      const pubBtn = document.createElement("button");
      pubBtn.type = "button";
      pubBtn.className = "btn btn-sm";
      pubBtn.textContent = q.status === "published" ? "Unpublish" : "Publish";
      pubBtn.addEventListener("click", async () => {
        try {
          const next = q.status === "published" ? "draft" : "published";
          await api("/api/admin/quizzes/" + encodeURIComponent(q.slug) + "/status", {
            method: "POST",
            body: JSON.stringify({ status: next }),
          });
          showBanner("Quiz '" + q.slug + "' is now " + next + ".");
          await loadQuizzes(q.slug);
        } catch (err) { showBanner(err.message, true); }
      });

      const dupBtn = document.createElement("button");
      dupBtn.type = "button";
      dupBtn.className = "btn btn-sm";
      dupBtn.textContent = "Duplicate";
      dupBtn.addEventListener("click", async () => {
        const newSlug = window.prompt("New slug for duplicate:", q.slug + "-copy");
        if (!newSlug) return;
        try {
          const created = await api("/api/admin/quizzes/" + encodeURIComponent(q.slug) + "/duplicate", {
            method: "POST",
            body: JSON.stringify({ slug: newSlug.trim().toLowerCase() }),
          });
          showBanner("Duplicated to '" + created.slug + "'.");
          await loadQuizzes(created.slug);
        } catch (err) { showBanner(err.message, true); }
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-sm";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => confirmDelete(q.slug));

      actions.append(pubBtn, dupBtn, delBtn);
      quizListEl.append(card);
    });
  }

  function confirmDelete(slug) {
    const dlg = document.getElementById("confirm-dialog");
    document.getElementById("confirm-title").textContent = "Delete quiz '" + slug + "'?";
    document.getElementById("confirm-message").textContent = "This permanently deletes the quiz definition and its revisions.";
    const okBtn = document.getElementById("confirm-ok-btn");
    const cancelBtn = document.getElementById("confirm-cancel-btn");
    const cleanup = () => dlg.close();
    cancelBtn.onclick = cleanup;
    okBtn.onclick = async () => {
      cleanup();
      try {
        await api("/api/admin/quizzes/" + encodeURIComponent(slug), { method: "DELETE" });
        showBanner("Deleted '" + slug + "'.");
        if (currentSlug === slug) currentSlug = null;
        await loadQuizzes();
      } catch (err) { showBanner(err.message, true); }
    };
    dlg.showModal();
  }

  function renderToolbar() {
    if (!draft) return;
    document.getElementById("editing-title").textContent = draft.title || draft.slug;
    document.getElementById("editing-slug").textContent = "/q/" + draft.slug + " (" + draft.status + ")";
    document.getElementById("export-csv-link").href = "/api/admin/quizzes/" + encodeURIComponent(draft.slug) + "/export";
    const liveLink = document.getElementById("open-live-link");
    liveLink.href = "/q/" + encodeURIComponent(draft.slug);
    liveLink.hidden = draft.status !== "published";
  }

  function makeField(labelText, inputEl) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lbl = document.createElement("label");
    lbl.textContent = labelText;
    wrap.append(lbl, inputEl);
    return wrap;
  }

  function moveItem(arr, idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    const tmp = arr[idx];
    arr[idx] = arr[target];
    arr[target] = tmp;
  }

  function renderTab() {
    if (!draft) return;
    tabContent.innerHTML = "";

    if (activeTab === "meta") {
      const p = document.createElement("div");
      p.className = "panel";

      const titleIn = document.createElement("input");
      titleIn.type = "text";
      titleIn.value = draft.title || "";
      titleIn.oninput = () => { draft.title = titleIn.value; renderToolbar(); schedulePreview(); };

      const subIn = document.createElement("input");
      subIn.type = "text";
      subIn.value = draft.subtitle || "";
      subIn.oninput = () => { draft.subtitle = subIn.value; schedulePreview(); };

      const slugIn = document.createElement("input");
      slugIn.type = "text";
      slugIn.value = draft.slug || "";
      slugIn.oninput = () => { draft.slug = slugIn.value.trim().toLowerCase(); renderToolbar(); };

      const statusSel = document.createElement("select");
      ["draft", "published"].forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        if (draft.status === s) opt.selected = true;
        statusSel.append(opt);
      });
      statusSel.onchange = () => { draft.status = statusSel.value; renderToolbar(); };

      const colorWrap = document.createElement("div");
      colorWrap.style.display = "flex";
      colorWrap.style.gap = "0.5rem";
      const colorPicker = document.createElement("input");
      colorPicker.type = "color";
      colorPicker.value = /^#[0-9a-fA-F]{6}$/.test(draft.theme.accent) ? draft.theme.accent : "#6b4fbb";
      colorPicker.style.width = "54px";
      colorPicker.style.height = "38px";
      const colorHex = document.createElement("input");
      colorHex.type = "text";
      colorHex.value = draft.theme.accent || "#6b4fbb";
      colorPicker.oninput = () => { draft.theme.accent = colorPicker.value; colorHex.value = colorPicker.value; schedulePreview(); };
      colorHex.oninput = () => {
        draft.theme.accent = colorHex.value;
        if (/^#[0-9a-fA-F]{6}$/.test(colorHex.value)) colorPicker.value = colorHex.value;
        schedulePreview();
      };
      colorWrap.append(colorPicker, colorHex);

      const headerIn = document.createElement("input");
      headerIn.type = "text";
      headerIn.value = draft.theme.headerText || "";
      headerIn.oninput = () => { draft.theme.headerText = headerIn.value; schedulePreview(); };

      const logoIn = document.createElement("input");
      logoIn.type = "url";
      logoIn.value = draft.theme.logoUrl || "";
      logoIn.placeholder = "https://... (optional fallback URL)";
      logoIn.oninput = () => { draft.theme.logoUrl = logoIn.value; schedulePreview(); };

      const sourcesIn = document.createElement("input");
      sourcesIn.type = "text";
      sourcesIn.value = (draft.sources || []).join(", ");
      sourcesIn.oninput = () => {
        draft.sources = sourcesIn.value.split(",").map((s) => s.trim()).filter(Boolean);
      };

      const logosBox = document.createElement("div");
      logosBox.className = "subcard";
      logosBox.style.marginTop = "1rem";
      const logosHead = document.createElement("div");
      logosHead.className = "subcard-head";
      logosHead.innerHTML = "<strong>Co-Brand Logos (Logo 1 &amp; Logo 2)</strong>";
      const logosNote = document.createElement("p");
      logosNote.className = "muted";
      logosNote.style.marginTop = "0";
      logosNote.textContent = "Upload PNG, JPG, or SVG files for Logo 1 (e.g. Steelcase) and Logo 2 (e.g. Logitech). Both render side by side when uploaded; a single logo renders alone; if neither is uploaded, the header and welcome screen fall back to the text lockup.";
      logosBox.append(logosHead, logosNote);

      const logosGrid = document.createElement("div");
      logosGrid.className = "row";

      [1, 2].forEach((slotNum) => {
        const slotKey = slotNum === 1 ? "logo1" : "logo2";
        const slotData = draft.theme[slotKey] || null;
        const card = document.createElement("div");
        card.className = "panel";
        card.style.marginBottom = "0";

        const cardTitle = document.createElement("strong");
        cardTitle.style.display = "block";
        cardTitle.style.marginBottom = "0.5rem";
        cardTitle.textContent = "Logo " + slotNum + (slotNum === 1 ? " (Primary)" : " (Co-brand)");
        card.append(cardTitle);

        const prevWrap = document.createElement("div");
        prevWrap.style.minHeight = "64px";
        prevWrap.style.display = "flex";
        prevWrap.style.alignItems = "center";
        prevWrap.style.justifyContent = "center";
        prevWrap.style.background = "#f3f4f6";
        prevWrap.style.border = "1px dashed #cbd5e1";
        prevWrap.style.borderRadius = "6px";
        prevWrap.style.padding = "0.5rem";
        prevWrap.style.marginBottom = "0.65rem";

        if (slotData && slotData.dataUrl) {
          const img = document.createElement("img");
          img.src = slotData.dataUrl;
          img.alt = slotData.alt || ("Logo " + slotNum);
          img.style.maxHeight = "44px";
          img.style.maxWidth = "180px";
          img.style.objectFit = "contain";
          prevWrap.append(img);
        } else {
          const emptyTxt = document.createElement("span");
          emptyTxt.className = "muted";
          emptyTxt.textContent = "No logo uploaded";
          prevWrap.append(emptyTxt);
        }
        card.append(prevWrap);

        const altIn = document.createElement("input");
        altIn.type = "text";
        altIn.placeholder = slotNum === 1 ? "Steelcase" : "Logitech";
        altIn.value = slotData?.alt || "";
        altIn.oninput = () => {
          if (draft.theme[slotKey]) {
            draft.theme[slotKey].alt = altIn.value;
            schedulePreview();
          }
        };
        card.append(makeField("Alt Text", altIn));

        const fileIn = document.createElement("input");
        fileIn.type = "file";
        fileIn.accept = ".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml";
        fileIn.style.fontSize = "0.82rem";
        fileIn.style.marginBottom = "0.5rem";
        fileIn.onchange = () => {
          const file = fileIn.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = String(reader.result || "");
            const alt = altIn.value.trim() || (slotNum === 1 ? "Logo 1" : "Logo 2");
            try {
              const saved = await api("/api/admin/quizzes/" + encodeURIComponent(currentSlug) + "/logos/" + slotNum, {
                method: "POST",
                body: JSON.stringify({ dataUrl, alt }),
              });
              draft.theme = saved.theme;
              showBanner("Uploaded Logo " + slotNum + ".");
              renderTab();
              schedulePreview();
            } catch (err) {
              showBanner("Logo upload failed: " + err.message, true);
            }
          };
          reader.readAsDataURL(file);
        };
        card.append(makeField("Upload / Replace (PNG, JPG, SVG)", fileIn));

        if (slotData && slotData.dataUrl) {
          const rmBtn = document.createElement("button");
          rmBtn.type = "button";
          rmBtn.className = "btn btn-sm btn-danger";
          rmBtn.textContent = "Remove Logo " + slotNum;
          rmBtn.onclick = async () => {
            try {
              const saved = await api("/api/admin/quizzes/" + encodeURIComponent(currentSlug) + "/logos/" + slotNum, {
                method: "DELETE",
              });
              draft.theme = saved.theme;
              showBanner("Removed Logo " + slotNum + ".");
              renderTab();
              schedulePreview();
            } catch (err) {
              showBanner("Remove logo failed: " + err.message, true);
            }
          };
          card.append(rmBtn);
        }

        logosGrid.append(card);
      });

      logosBox.append(logosGrid);

      p.append(
        makeField("Title", titleIn),
        makeField("Subtitle", subIn),
        makeField("Slug (URL-safe)", slugIn),
        makeField("Status", statusSel),
        makeField("Theme Accent Color", colorWrap),
        makeField("Theme Header Text (Fallback lockup)", headerIn),
        logosBox,
        makeField("Legacy Logo URL (optional fallback)", logoIn),
        makeField("Allowed Tracking Sources (comma-separated)", sourcesIn),
      );
      tabContent.append(p);
      return;
    }

    if (activeTab === "copy") {
      if (!draft.copy) draft.copy = {};
      const p = document.createElement("div");
      p.className = "panel";

      const intro = document.createElement("p");
      intro.className = "muted";
      intro.style.marginTop = "0";
      intro.textContent = "Every respondent-visible heading, sub-line, button label, progress template, form label, error message, and CTA card string is editable below.";
      p.append(intro);

      const copyGroups = [
        {
          title: "Welcome Screen & Co-Brand Lockup",
          fields: [
            ["welcomeSubline", "Welcome Sub-line / Co-brand Lockup", "Steelcase and Logitech: Hybrid Meeting Readiness Assessment"],
            ["welcomeHeadline", "Welcome Headline", "How Hybrid-Ready Are Your Meetings?"],
            ["welcomeMetaTemplate", "Welcome Meta Line (supports {areas}, {questions})", "~2 minutes · {questions} questions · See how ready your meetings are for hybrid work with this assessment."],
            ["welcomeAreasHeading", "Welcome Areas List Heading", "Areas covered in this assessment"],
            ["consentRequiredError", "Consent Required Error Message", "Please tick the consent box to continue."],
            ["startButton", "Start Button Label", "Start the assessment"],
          ],
        },
        {
          title: "Progress Bar & Section Intros",
          fields: [
            ["progressProfileLabel", "Profile Progress Label (supports {current}, {total})", "About you · Question {current} of {total}"],
            ["progressQuestionTemplate", "Scored Question Progress Label (supports {area}, {areaIndex}, {areaTotal}, {overallIndex}, {overallTotal})", "{area} · Question {areaIndex} of {areaTotal} in this area · {overallIndex} of {overallTotal} overall"],
            ["sectionIntroEyebrowTemplate", "Section Intro Eyebrow (supports {index}, {total})", "Area {index} of {total}"],
            ["sectionIntroDefaultBlurb", "Default Section Intro Blurb", "Let's look at how your spaces and habits perform in this area."],
            ["sectionIntroContinueButton", "Section Intro Continue Button", "Continue"],
            ["backButton", "Back Button Label", "← Back"],
          ],
        },
        {
          title: "Questions & 'Other' Free-Text Input",
          fields: [
            ["profileQuestionEyebrowTemplate", "Profile Question Eyebrow (supports {current}, {total})", "Profile · {current} of {total}"],
            ["scoredQuestionEyebrowTemplate", "Scored Question Eyebrow (supports {area}, {current}, {total})", "{area} · {current} of {total}"],
            ["keyboardHint", "Desktop Keyboard Hint", "Tip: press A–D to select, Enter to continue"],
            ["otherSpecifyLabel", "'Other' Free-Text Input Label", "Please specify (optional)"],
            ["otherSpecifyPlaceholder", "'Other' Free-Text Input Placeholder", "Type your answer..."],
          ],
        },
        {
          title: "Lead-Capture Step & Form Validation",
          fields: [
            ["leadEyebrow", "Lead Step Eyebrow", "Last step"],
            ["leadHeading", "Lead Step Heading", "Where should we send your results?"],
            ["leadSubheading", "Lead Step Subheading", "Your readiness score and biggest gap will appear on the next screen immediately."],
            ["firstNameLabel", "First Name Label", "First name"],
            ["firstNameError", "First Name Error Message", "Please enter your first name."],
            ["lastNameLabel", "Last Name Label", "Last name"],
            ["lastNameError", "Last Name Error Message", "Please enter your last name."],
            ["emailLabel", "Work Email Label", "Work email"],
            ["emailError", "Work Email Error Message", "Please enter a valid work email address."],
            ["companyLabel", "Company Label", "Company"],
            ["companyError", "Company Error Message", "Please enter your company name."],
            ["jobTitleLabel", "Job Title Label", "Job title"],
            ["jobTitleOptionalText", "Job Title Optional Suffix", "(optional)"],
            ["submitButton", "Submit Button Label", "See my results"],
            ["submittingButton", "Submitting Button Label (in progress)", "Calculating your results…"],
            ["turnstileError", "Turnstile Error Message", "Please complete the verification check before submitting."],
            ["networkError", "Network Error Message", "Network error while submitting. Please check your connection and try again."],
          ],
        },
        {
          title: "Results Screen & 'Speak to us' CTA Card",
          fields: [
            ["resultsReadinessLabel", "Score Ring Sub-label", "Readiness"],
            ["resultsBreakdownHeading", "Area Breakdown Heading", "Breakdown by area"],
            ["resultsGapHeadingSingular", "Gap Section Heading (Singular, Bands 1–3)", "Your biggest gap"],
            ["resultsGapHeadingPlural", "Gap Section Heading (Tied/Plural, Bands 1–3)", "Your biggest gaps"],
            ["resultsGapBadgeText", "Gap Card Badge Text (Bands 1–3)", "Priority focus area"],
            ["resultsBand4GapHeading", "Band 4 Section Heading", "Where to keep your edge"],
            ["resultsBand4BadgeText", "Band 4 Card Badge Text", "Strength to maintain"],
            ["ctaHeading", "CTA Card Heading", "Want to talk it through?"],
            ["ctaBody", "CTA Card Body", "Book a short call with a Steelcase workplace specialist about your biggest gap."],
            ["ctaButton", "CTA Button Label", "Speak to us"],
            ["ctaUrl", "CTA Destination URL", "#"],
          ],
        },
      ];

      copyGroups.forEach((grp) => {
        const box = document.createElement("div");
        box.className = "subcard";
        const h = document.createElement("div");
        h.className = "subcard-head";
        h.innerHTML = "<strong>" + grp.title + "</strong>";
        box.append(h);

        grp.fields.forEach(([key, label, placeholder]) => {
          const inp = document.createElement("input");
          inp.type = "text";
          inp.value = draft.copy[key] ?? placeholder;
          inp.placeholder = placeholder;
          inp.oninput = () => {
            draft.copy[key] = inp.value;
            schedulePreview();
          };
          box.append(makeField(label, inp));
        });
        p.append(box);
      });

      tabContent.append(p);
      return;
    }

    if (activeTab === "consent") {
      const p = document.createElement("div");
      p.className = "panel";
      const verIn = document.createElement("input");
      verIn.type = "text";
      verIn.value = draft.consent.textVersion || "";
      verIn.oninput = () => { draft.consent.textVersion = verIn.value; schedulePreview(); };

      const txtIn = document.createElement("textarea");
      txtIn.value = draft.consent.text || "";
      txtIn.oninput = () => { draft.consent.text = txtIn.value; schedulePreview(); };

      p.append(makeField("Consent Text Version", verIn), makeField("Consent Copy", txtIn));

      if (!Array.isArray(draft.consent.privacyLinks)) {
        draft.consent.privacyLinks = [
          { label: "Steelcase privacy policy", url: "https://www.steelcase.com/privacy-policy/" },
          { label: "Logitech privacy policy", url: "https://www.logitech.com/en-us/legal/privacy-policy.html" },
        ];
      }

      const linksBox = document.createElement("div");
      linksBox.className = "subcard";
      linksBox.innerHTML = "<div class=\\"subcard-head\\"><strong>Privacy Policy Links</strong></div>";

      draft.consent.privacyLinks.forEach((lnk, li) => {
        const row = document.createElement("div");
        row.className = "opt-row";
        row.style.gridTemplateColumns = "1fr 1.4fr auto";
        const lblIn = document.createElement("input");
        lblIn.type = "text";
        lblIn.placeholder = "Link label (e.g. Steelcase privacy policy)";
        lblIn.value = lnk.label || "";
        lblIn.oninput = () => { lnk.label = lblIn.value; schedulePreview(); };

        const urlIn = document.createElement("input");
        urlIn.type = "text";
        urlIn.placeholder = "https://...";
        urlIn.value = lnk.url || "";
        urlIn.oninput = () => { lnk.url = urlIn.value; schedulePreview(); };

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn-sm";
        delBtn.textContent = "×";
        delBtn.onclick = () => {
          draft.consent.privacyLinks.splice(li, 1);
          renderTab();
          schedulePreview();
        };

        row.append(lblIn, urlIn, delBtn);
        linksBox.append(row);
      });

      const addLinkBtn = document.createElement("button");
      addLinkBtn.type = "button";
      addLinkBtn.className = "btn btn-sm";
      addLinkBtn.textContent = "+ Add Privacy Policy Link";
      addLinkBtn.onclick = () => {
        draft.consent.privacyLinks.push({ label: "Privacy policy", url: "https://" });
        renderTab();
        schedulePreview();
      };
      linksBox.append(addLinkBtn);
      p.append(linksBox);

      tabContent.append(p);
      return;
    }

    if (activeTab === "profile") {
      const p = document.createElement("div");
      p.className = "panel";
      draft.profileQuestions.forEach((pq, idx) => {
        const box = document.createElement("div");
        box.className = "subcard";
        const head = document.createElement("div");
        head.className = "subcard-head";
        head.innerHTML = "<strong>Profile Question #" + (idx + 1) + "</strong>";
        const btns = document.createElement("div");
        btns.style.display = "flex";
        btns.style.gap = "0.25rem";

        const up = document.createElement("button");
        up.type = "button"; up.className = "btn btn-sm"; up.textContent = "▲";
        up.onclick = () => { moveItem(draft.profileQuestions, idx, -1); renderTab(); schedulePreview(); };
        const dn = document.createElement("button");
        dn.type = "button"; dn.className = "btn btn-sm"; dn.textContent = "▼";
        dn.onclick = () => { moveItem(draft.profileQuestions, idx, 1); renderTab(); schedulePreview(); };
        const rm = document.createElement("button");
        rm.type = "button"; rm.className = "btn btn-sm"; rm.textContent = "Remove";
        rm.onclick = () => { draft.profileQuestions.splice(idx, 1); renderTab(); schedulePreview(); };
        btns.append(up, dn, rm);
        head.append(btns);

        const idIn = document.createElement("input");
        idIn.type = "text"; idIn.value = pq.id;
        idIn.oninput = () => { pq.id = idIn.value.trim(); schedulePreview(); };

        const lblIn = document.createElement("input");
        lblIn.type = "text"; lblIn.value = pq.label || "";
        lblIn.oninput = () => { pq.label = lblIn.value; schedulePreview(); };

        box.append(head, makeField("ID", idIn), makeField("Label", lblIn));

        const optTitle = document.createElement("div");
        optTitle.className = "muted";
        optTitle.style.marginBottom = "0.35rem";
        optTitle.textContent = "Options (code, display text, and optional 'Other' free-text input):";
        box.append(optTitle);

        pq.options.forEach((opt, oi) => {
          const row = document.createElement("div");
          row.className = "opt-row";
          row.style.gridTemplateColumns = "130px 1fr auto auto";
          const codeIn = document.createElement("input");
          codeIn.type = "text"; codeIn.value = opt.code; codeIn.placeholder = "code";
          codeIn.oninput = () => { opt.code = codeIn.value; schedulePreview(); };
          const textIn = document.createElement("input");
          textIn.type = "text"; textIn.value = opt.text; textIn.placeholder = "Display text";
          textIn.oninput = () => { opt.text = textIn.value; schedulePreview(); };

          const ftLbl = document.createElement("label");
          ftLbl.style.display = "inline-flex";
          ftLbl.style.alignItems = "center";
          ftLbl.style.gap = "0.3rem";
          ftLbl.style.fontSize = "0.78rem";
          ftLbl.style.whiteSpace = "nowrap";
          const ftChk = document.createElement("input");
          ftChk.type = "checkbox";
          ftChk.checked = Boolean(opt.allowFreeText);
          ftChk.onchange = () => { opt.allowFreeText = ftChk.checked; schedulePreview(); };
          ftLbl.append(ftChk, document.createTextNode("Free-text"));

          const delOpt = document.createElement("button");
          delOpt.type = "button"; delOpt.className = "btn btn-sm"; delOpt.textContent = "×";
          delOpt.onclick = () => { pq.options.splice(oi, 1); renderTab(); schedulePreview(); };
          row.append(codeIn, textIn, ftLbl, delOpt);
          box.append(row);
        });

        const addOpt = document.createElement("button");
        addOpt.type = "button"; addOpt.className = "btn btn-sm"; addOpt.textContent = "+ Add Option";
        addOpt.onclick = () => { pq.options.push({ code: "opt_" + (pq.options.length + 1), text: "New option" }); renderTab(); schedulePreview(); };
        box.append(addOpt);
        p.append(box);
      });

      const addPq = document.createElement("button");
      addPq.type = "button"; addPq.className = "btn btn-primary"; addPq.textContent = "+ Add Profile Question";
      addPq.onclick = () => {
        draft.profileQuestions.push({ id: "p" + (draft.profileQuestions.length + 1), label: "New profile question", options: [{ code: "opt_1", text: "Option 1" }] });
        renderTab(); schedulePreview();
      };
      p.append(addPq);
      tabContent.append(p);
      return;
    }

    if (activeTab === "areas") {
      const p = document.createElement("div");
      p.className = "panel";
      draft.areas.forEach((area, idx) => {
        const box = document.createElement("div");
        box.className = "subcard";
        const head = document.createElement("div");
        head.className = "subcard-head";
        head.innerHTML = "<strong>Area #" + (idx + 1) + "</strong>";
        const rm = document.createElement("button");
        rm.type = "button"; rm.className = "btn btn-sm"; rm.textContent = "Remove";
        rm.onclick = () => { draft.areas.splice(idx, 1); renderTab(); schedulePreview(); };
        head.append(rm);

        const keyIn = document.createElement("input");
        keyIn.type = "text"; keyIn.value = area.key;
        keyIn.onchange = () => {
          const oldKey = area.key;
          const nextKey = keyIn.value.trim();
          area.key = nextKey;
          if (oldKey && nextKey && oldKey !== nextKey && draft.scoring.gapCopy[oldKey]) {
            draft.scoring.gapCopy[nextKey] = draft.scoring.gapCopy[oldKey];
            delete draft.scoring.gapCopy[oldKey];
          }
          renderTab(); schedulePreview();
        };
        const nameIn = document.createElement("input");
        nameIn.type = "text"; nameIn.value = area.name;
        nameIn.oninput = () => { area.name = nameIn.value; schedulePreview(); };

        const blurbIn = document.createElement("input");
        blurbIn.type = "text"; blurbIn.value = area.blurb || "";
        blurbIn.placeholder = "One-line why-it-matters shown on the section intro card";
        blurbIn.oninput = () => { area.blurb = blurbIn.value; schedulePreview(); };

        if (!draft.scoring.gapCopy[area.key]) draft.scoring.gapCopy[area.key] = { headline: "", tip: "" };
        const gapH = document.createElement("input");
        gapH.type = "text"; gapH.value = draft.scoring.gapCopy[area.key].headline || "";
        gapH.oninput = () => { draft.scoring.gapCopy[area.key].headline = gapH.value; schedulePreview(); };
        const gapT = document.createElement("textarea");
        gapT.value = draft.scoring.gapCopy[area.key].tip || "";
        gapT.oninput = () => { draft.scoring.gapCopy[area.key].tip = gapT.value; schedulePreview(); };

        box.append(
          head,
          makeField("Area Key", keyIn),
          makeField("Display Name", nameIn),
          makeField("Section Intro Blurb (optional)", blurbIn),
          makeField("Gap Card Headline", gapH),
          makeField("Gap Card Tip", gapT),
        );
        p.append(box);
      });

      const addArea = document.createElement("button");
      addArea.type = "button"; addArea.className = "btn btn-primary"; addArea.textContent = "+ Add Area";
      addArea.onclick = () => {
        const key = "area_" + (draft.areas.length + 1);
        draft.areas.push({ key, name: "New Area" });
        draft.scoring.gapCopy[key] = { headline: "Opportunity headline", tip: "Actionable tip." };
        renderTab(); schedulePreview();
      };
      p.append(addArea);
      tabContent.append(p);
      return;
    }

    if (activeTab === "questions") {
      const p = document.createElement("div");
      p.className = "panel";
      draft.scoredQuestions.forEach((sq, idx) => {
        const box = document.createElement("div");
        box.className = "subcard";
        const head = document.createElement("div");
        head.className = "subcard-head";
        head.innerHTML = "<strong>Scored Question #" + (idx + 1) + " (" + sq.id + ")</strong>";
        const btns = document.createElement("div");
        btns.style.display = "flex"; btns.style.gap = "0.25rem";
        const up = document.createElement("button"); up.type = "button"; up.className = "btn btn-sm"; up.textContent = "▲";
        up.onclick = () => { moveItem(draft.scoredQuestions, idx, -1); renderTab(); schedulePreview(); };
        const dn = document.createElement("button"); dn.type = "button"; dn.className = "btn btn-sm"; dn.textContent = "▼";
        dn.onclick = () => { moveItem(draft.scoredQuestions, idx, 1); renderTab(); schedulePreview(); };
        const rm = document.createElement("button"); rm.type = "button"; rm.className = "btn btn-sm"; rm.textContent = "Remove";
        rm.onclick = () => { draft.scoredQuestions.splice(idx, 1); renderTab(); schedulePreview(); };
        btns.append(up, dn, rm);
        head.append(btns);

        const idIn = document.createElement("input"); idIn.type = "text"; idIn.value = sq.id;
        idIn.oninput = () => { sq.id = idIn.value.trim(); schedulePreview(); };

        const areaSel = document.createElement("select");
        draft.areas.forEach((a) => {
          const opt = document.createElement("option");
          opt.value = a.key; opt.textContent = a.name + " (" + a.key + ")";
          if (sq.area === a.key) opt.selected = true;
          areaSel.append(opt);
        });
        areaSel.onchange = () => { sq.area = areaSel.value; schedulePreview(); };

        const txtIn = document.createElement("input"); txtIn.type = "text"; txtIn.value = sq.text;
        txtIn.oninput = () => { sq.text = txtIn.value; schedulePreview(); };

        const metaRow = document.createElement("div");
        metaRow.className = "row";
        metaRow.append(makeField("Question ID", idIn), makeField("Area", areaSel));
        box.append(head, metaRow, makeField("Question Text", txtIn));

        const optLbl = document.createElement("div");
        optLbl.className = "muted"; optLbl.style.marginBottom = "0.35rem";
        optLbl.textContent = "Options (points + text):";
        box.append(optLbl);

        sq.options.forEach((opt, oi) => {
          const row = document.createElement("div");
          row.className = "opt-row";
          const ptsIn = document.createElement("input"); ptsIn.type = "number"; ptsIn.value = String(opt.points);
          ptsIn.oninput = () => { opt.points = Number(ptsIn.value); schedulePreview(); };
          const textIn = document.createElement("input"); textIn.type = "text"; textIn.value = opt.text;
          textIn.oninput = () => { opt.text = textIn.value; schedulePreview(); };
          const delOpt = document.createElement("button"); delOpt.type = "button"; delOpt.className = "btn btn-sm"; delOpt.textContent = "×";
          delOpt.onclick = () => {
            sq.options.splice(oi, 1);
            sq.displayOrder = sq.options.map((_, k) => k);
            renderTab(); schedulePreview();
          };
          row.append(ptsIn, textIn, delOpt);
          box.append(row);
        });

        const addOpt = document.createElement("button"); addOpt.type = "button"; addOpt.className = "btn btn-sm"; addOpt.textContent = "+ Add Option";
        addOpt.onclick = () => {
          sq.options.push({ points: 0, text: "New option" });
          sq.displayOrder = sq.options.map((_, k) => k);
          renderTab(); schedulePreview();
        };

        // Display Order editor
        const dispBox = document.createElement("div");
        dispBox.style.marginTop = "0.65rem";
        const dispTitle = document.createElement("div");
        dispTitle.className = "muted";
        dispTitle.textContent = "Display order (shown to respondent):";
        dispBox.append(dispTitle);
        const order = Array.isArray(sq.displayOrder) && sq.displayOrder.length
          ? sq.displayOrder
          : sq.options.map((_, k) => k);
        order.forEach((entry, di) => {
          const optObj = typeof entry === "number" ? sq.options[entry] : sq.options.find((o) => o.text === entry);
          const dRow = document.createElement("div");
          dRow.style.display = "flex"; dRow.style.gap = "0.4rem"; dRow.style.alignItems = "center"; dRow.style.marginTop = "0.25rem";
          const lbl = document.createElement("span");
          lbl.style.flex = "1"; lbl.style.fontSize = "0.84rem";
          lbl.textContent = (di + 1) + ". " + (optObj ? optObj.text + " (" + optObj.points + " pts)" : String(entry));
          const u = document.createElement("button"); u.type = "button"; u.className = "btn btn-sm"; u.textContent = "▲";
          u.onclick = () => {
            sq.displayOrder = [...order];
            moveItem(sq.displayOrder, di, -1);
            renderTab(); schedulePreview();
          };
          const d = document.createElement("button"); d.type = "button"; d.className = "btn btn-sm"; d.textContent = "▼";
          d.onclick = () => {
            sq.displayOrder = [...order];
            moveItem(sq.displayOrder, di, 1);
            renderTab(); schedulePreview();
          };
          dRow.append(lbl, u, d);
          dispBox.append(dRow);
        });

        box.append(addOpt, dispBox);
        p.append(box);
      });

      const addSq = document.createElement("button"); addSq.type = "button"; addSq.className = "btn btn-primary"; addSq.textContent = "+ Add Scored Question";
      addSq.onclick = () => {
        draft.scoredQuestions.push({
          id: "q" + (draft.scoredQuestions.length + 1),
          area: draft.areas[0]?.key || "general",
          text: "New scored question?",
          displayOrder: [0, 1],
          options: [{ points: 3, text: "Best" }, { points: 0, text: "Worst" }],
        });
        renderTab(); schedulePreview();
      };
      p.append(addSq);
      tabContent.append(p);
      return;
    }

    if (activeTab === "scoring") {
      const p = document.createElement("div");
      p.className = "panel";

      const verIn = document.createElement("input"); verIn.type = "text"; verIn.value = draft.scoring.scoringVersion || "";
      verIn.oninput = () => { draft.scoring.scoringVersion = verIn.value; };
      p.append(makeField("Scoring Version", verIn));

      draft.scoring.bands.forEach((b, idx) => {
        const box = document.createElement("div");
        box.className = "subcard";
        const head = document.createElement("div");
        head.className = "subcard-head";
        head.innerHTML = "<strong>Band " + b.band + "</strong>";
        const rm = document.createElement("button"); rm.type = "button"; rm.className = "btn btn-sm"; rm.textContent = "Remove";
        rm.onclick = () => { draft.scoring.bands.splice(idx, 1); renderTab(); schedulePreview(); };
        head.append(rm);

        const numIn = document.createElement("input"); numIn.type = "number"; numIn.value = String(b.band);
        numIn.oninput = () => { b.band = Number(numIn.value); };
        const minIn = document.createElement("input"); minIn.type = "number"; minIn.value = String(b.min);
        minIn.oninput = () => { b.min = Number(minIn.value); schedulePreview(); };
        const maxIn = document.createElement("input"); maxIn.type = "number"; maxIn.value = String(b.max);
        maxIn.oninput = () => { b.max = Number(maxIn.value); schedulePreview(); };
        const lblIn = document.createElement("input"); lblIn.type = "text"; lblIn.value = b.label;
        lblIn.oninput = () => { b.label = lblIn.value; schedulePreview(); };
        const hlIn = document.createElement("input"); hlIn.type = "text"; hlIn.value = b.headline;
        hlIn.oninput = () => { b.headline = hlIn.value; schedulePreview(); };
        const bodyIn = document.createElement("textarea"); bodyIn.value = b.body;
        bodyIn.oninput = () => { b.body = bodyIn.value; schedulePreview(); };

        const fbKey = String(b.band);
        const fbIn = document.createElement("textarea");
        fbIn.value = draft.scoring.fallbackParagraphs?.[fbKey] || "";
        fbIn.oninput = () => {
          if (!draft.scoring.fallbackParagraphs) draft.scoring.fallbackParagraphs = {};
          draft.scoring.fallbackParagraphs[fbKey] = fbIn.value;
        };

        const grid = document.createElement("div");
        grid.className = "row";
        grid.append(makeField("Band #", numIn), makeField("Min %", minIn), makeField("Max %", maxIn), makeField("Label", lblIn));

        box.append(
          head,
          grid,
          makeField("Headline (supports [X] or {pct})", hlIn),
          makeField("Body", bodyIn),
          makeField("Email Fallback Paragraph Template (slots: {pct}, {band}, {gapNames}, {gapTip})", fbIn),
        );
        p.append(box);
      });

      const addBand = document.createElement("button"); addBand.type = "button"; addBand.className = "btn btn-sm"; addBand.textContent = "+ Add Band";
      addBand.onclick = () => {
        draft.scoring.bands.push({ band: draft.scoring.bands.length + 1, min: 0, max: 100, label: "Band", headline: "You're at [X]%.", body: "" });
        renderTab();
      };
      p.append(addBand);

      const prBox = document.createElement("div");
      prBox.className = "subcard";
      prBox.style.marginTop = "1rem";
      prBox.innerHTML = "<strong>Priority Follow-up Rule</strong>";
      const pr = draft.scoring.priorityRule;
      const bMax = document.createElement("input"); bMax.type = "number"; bMax.value = String(pr.bandsAtOrBelow);
      bMax.oninput = () => { pr.bandsAtOrBelow = Number(bMax.value); };
      const rVals = document.createElement("input"); rVals.type = "text"; rVals.value = (pr.roleValues || []).join(" | ");
      rVals.oninput = () => { pr.roleValues = rVals.value.split("|").map((s) => s.trim()).filter(Boolean); };
      const sVals = document.createElement("input"); sVals.type = "text"; sVals.value = (pr.sizeValues || []).join(" | ");
      sVals.oninput = () => { pr.sizeValues = sVals.value.split("|").map((s) => s.trim()).filter(Boolean); };
      prBox.append(
        makeField("Bands at or below", bMax),
        makeField("Matching Role Values (separated by | )", rVals),
        makeField("Matching Size Values (separated by | )", sVals),
      );
      p.append(prBox);
      tabContent.append(p);
      return;
    }

    if (activeTab === "closing") {
      const p = document.createElement("div");
      p.className = "panel";

      const phaseSel = document.createElement("select");
      ["pre", "post"].forEach((ph) => {
        const opt = document.createElement("option");
        opt.value = ph; opt.textContent = ph === "pre" ? "Pre-event (livePhase: pre)" : "Post-event (livePhase: post)";
        if ((draft.closing.livePhase || "pre") === ph) opt.selected = true;
        phaseSel.append(opt);
      });
      phaseSel.onchange = () => { draft.closing.livePhase = phaseSel.value; schedulePreview(); };

      const preIn = document.createElement("textarea"); preIn.value = draft.closing.preEvent || "";
      preIn.oninput = () => { draft.closing.preEvent = preIn.value; schedulePreview(); };

      const postIn = document.createElement("textarea"); postIn.value = draft.closing.postEvent || "";
      postIn.oninput = () => { draft.closing.postEvent = postIn.value; schedulePreview(); };

      const hsIn = document.createElement("input"); hsIn.type = "text"; hsIn.value = draft.integration?.hubspot?.mappingStyle || "hybrid-2026";
      hsIn.oninput = () => { draft.integration.hubspot.mappingStyle = hsIn.value; };

      const gemChk = document.createElement("input"); gemChk.type = "checkbox"; gemChk.checked = draft.integration?.gemini?.enabled !== false;
      gemChk.onchange = () => { draft.integration.gemini.enabled = gemChk.checked; };
      const gemWrap = document.createElement("label");
      gemWrap.style.display = "flex"; gemWrap.style.gap = "0.5rem"; gemWrap.style.alignItems = "center";
      gemWrap.append(gemChk, document.createTextNode("Enable Gemini email-only paragraph"));

      p.append(
        makeField("Live Phase", phaseSel),
        makeField("Pre-Event Closing Line", preIn),
        makeField("Post-Event Closing Line", postIn),
        makeField("HubSpot Mapping Style", hsIn),
        gemWrap,
      );
      tabContent.append(p);
      return;
    }

    if (activeTab === "responses") {
      const p = document.createElement("div");
      p.className = "panel";
      const headRow = document.createElement("div");
      headRow.className = "subcard-head";
      headRow.innerHTML = "<h3 style=\\"margin:0;\\">Recent Submissions</h3>";
      const csvBtn = document.createElement("a");
      csvBtn.className = "btn btn-sm";
      csvBtn.href = "/api/admin/quizzes/" + encodeURIComponent(draft.slug) + "/export";
      csvBtn.textContent = "Download CSV";
      headRow.append(csvBtn);
      p.append(headRow);

      const listWrap = document.createElement("div");
      listWrap.className = "muted";
      listWrap.textContent = "Loading submissions…";
      p.append(listWrap);
      tabContent.append(p);

      api("/api/admin/quizzes/" + encodeURIComponent(draft.slug) + "/submissions")
        .then((subs) => {
          listWrap.innerHTML = "";
          if (!Array.isArray(subs) || subs.length === 0) {
            listWrap.textContent = "No submissions recorded for this quiz yet.";
            return;
          }
          subs.forEach((s) => {
            const card = document.createElement("div");
            card.className = "subcard";
            card.style.color = "#111827";
            const top = document.createElement("div");
            top.className = "subcard-head";
            const who = document.createElement("strong");
            who.textContent = (s.firstName || "") + " " + (s.lastName || "") + " <" + (s.email || "") + ">";
            const scoreBadge = document.createElement("span");
            scoreBadge.className = "badge badge-published";
            scoreBadge.textContent = s.overallPct + "% · " + (s.bandLabel || ("Band " + s.band));
            top.append(who, scoreBadge);

            const meta = document.createElement("div");
            meta.className = "muted";
            meta.textContent =
              (s.company || "") +
              (s.jobTitle ? " · " + s.jobTitle : "") +
              " · " +
              (s.submittedAt || "") +
              " · Gap: " +
              (s.lowestAreas || []).join(", ");

            const profList = document.createElement("div");
            profList.style.marginTop = "0.45rem";
            profList.style.fontSize = "0.84rem";
            const profParts = [];
            const profObj = s.profile || {};
            const otherObj = s.profileOther || {};
            Object.keys(profObj).forEach((pid) => {
              let val = profObj[pid];
              if (otherObj[pid]) {
                val += " (\"" + otherObj[pid] + "\")";
              }
              profParts.push(pid.toUpperCase() + ": " + val);
            });
            profList.textContent = profParts.join("  |  ");

            card.append(top, meta, profList);
            listWrap.append(card);
          });
        })
        .catch((err) => {
          listWrap.textContent = "Failed to load submissions: " + err.message;
        });
      return;
    }

    if (activeTab === "revisions") {
      const p = document.createElement("div");
      p.className = "panel";
      const h = document.createElement("h3"); h.style.marginTop = "0"; h.textContent = "Last 10 Revisions";
      p.append(h);

      if (!revisions.length) {
        const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "No saved revisions yet.";
        p.append(empty);
      } else {
        revisions.forEach((rev) => {
          const row = document.createElement("div");
          row.className = "subcard";
          row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.alignItems = "center";
          const info = document.createElement("div");
          info.innerHTML = "<strong></strong><div class=\\"muted\\"></div>";
          info.querySelector("strong").textContent = rev.savedAt;
          info.querySelector(".muted").textContent = rev.note || rev.revisionId;
          const btn = document.createElement("button");
          btn.type = "button"; btn.className = "btn btn-sm"; btn.textContent = "Restore";
          btn.onclick = async () => {
            try {
              await api("/api/admin/quizzes/" + encodeURIComponent(draft.slug) + "/revisions/" + encodeURIComponent(rev.revisionId) + "/restore", { method: "POST" });
              showBanner("Restored revision " + rev.revisionId + ".");
              await selectQuiz(draft.slug);
            } catch (err) { showBanner(err.message, true); }
          };
          row.append(info, btn);
          p.append(row);
        });
      }

      const rawArea = document.createElement("textarea");
      rawArea.style.minHeight = "260px";
      rawArea.style.fontFamily = "monospace";
      rawArea.style.fontSize = "0.8rem";
      rawArea.value = JSON.stringify(draft, null, 2);
      const applyRawBtn = document.createElement("button");
      applyRawBtn.type = "button"; applyRawBtn.className = "btn"; applyRawBtn.textContent = "Apply JSON into Editor";
      applyRawBtn.onclick = () => {
        try {
          draft = JSON.parse(rawArea.value);
          renderToolbar();
          schedulePreview();
          showBanner("Applied raw JSON to editor. Click Validate & Save to persist.");
        } catch (err) {
          showBanner("Invalid JSON: " + err.message, true);
        }
      };

      p.append(makeField("Definition JSON", rawArea), applyRawBtn);
      tabContent.append(p);
    }
  }

  document.getElementById("editor-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    renderTab();
  });

  document.getElementById("save-btn").addEventListener("click", async () => {
    if (!draft) return;
    clearBanner();
    try {
      const saved = await api("/api/admin/quizzes/" + encodeURIComponent(currentSlug), {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      showBanner("Saved '" + saved.slug + "' (new revision recorded).");
      await loadQuizzes(saved.slug);
    } catch (err) {
      showBanner("Validation / save error: " + err.message, true);
    }
  });

  document.getElementById("export-json-btn").addEventListener("click", () => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = draft.slug + ".json";
    a.click();
  });

  document.getElementById("export-html-btn").addEventListener("click", () => {
    if (!draft) return;
    const dlg = document.getElementById("standalone-dialog");
    const epInput = document.getElementById("standalone-endpoint");
    epInput.value = window.location.origin + "/api/quizzes/" + encodeURIComponent(draft.slug) + "/submit";
    document.getElementById("standalone-cancel-btn").onclick = () => dlg.close();
    document.getElementById("standalone-download-btn").onclick = () => {
      const ep = epInput.value.trim();
      dlg.close();
      window.location.href = "/api/admin/quizzes/" + encodeURIComponent(draft.slug) + "/standalone?endpoint=" + encodeURIComponent(ep);
    };
    dlg.showModal();
  });

  document.getElementById("refresh-preview-btn").addEventListener("click", refreshPreview);

  document.getElementById("new-quiz-btn").addEventListener("click", async () => {
    const slug = window.prompt("Enter URL-safe slug for new quiz (e.g. workplace-pulse):", "new-quiz-" + Date.now().toString().slice(-4));
    if (!slug) return;
    try {
      const created = await api("/api/admin/quizzes", {
        method: "POST",
        body: JSON.stringify(createBlankQuiz(slug.trim().toLowerCase())),
      });
      showBanner("Created '" + created.slug + "'.");
      await loadQuizzes(created.slug);
    } catch (err) { showBanner(err.message, true); }
  });

  document.getElementById("import-json-btn").addEventListener("click", () => {
    const dlg = document.getElementById("import-dialog");
    const fileIn = document.getElementById("import-file");
    const textIn = document.getElementById("import-textarea");
    textIn.value = "";
    fileIn.value = "";
    fileIn.onchange = async () => {
      if (fileIn.files?.[0]) textIn.value = await fileIn.files[0].text();
    };
    document.getElementById("import-cancel-btn").onclick = () => dlg.close();
    document.getElementById("import-confirm-btn").onclick = async () => {
      try {
        const parsed = JSON.parse(textIn.value);
        const created = await api("/api/admin/quizzes/import", {
          method: "POST",
          body: JSON.stringify(parsed),
        });
        dlg.close();
        showBanner("Imported '" + created.slug + "'.");
        await loadQuizzes(created.slug);
      } catch (err) {
        showBanner("Import failed: " + err.message, true);
      }
    };
    dlg.showModal();
  });

  document.getElementById("retry-sweep-btn").addEventListener("click", async () => {
    try {
      const res = await api("/api/admin/retry", { method: "POST" });
      showBanner("Retry sweep finished: processed=" + res.processed + ", synced=" + res.synced + ", failed=" + res.failed + ", stillPending=" + res.stillPending);
    } catch (err) { showBanner(err.message, true); }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });

  loadQuizzes().catch((err) => showBanner(err.message, true));
})();
</script>
</body>
</html>`;
}
