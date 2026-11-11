# sc-quiz-designer

Reusable quiz platform with three parts:
1. **Builder (`/admin`)**: Token-gated admin workspace to create, edit, duplicate, validate, preview, publish, version (last 10 revisions with one-click restore), export JSON, export CSV, and export standalone single-file HTML.
2. **Renderer (`/q/<slug>`)**: Fast, accessible, zero-bloat public quiz page for published quizzes, supporting Variant A (`?fn=&ln=&em=&co=&src=` prefill with "Not you?"), Variant B (final capture with free-email soft warning), `sessionStorage` resume, Cloudflare Turnstile, and dynamic accent theming.
3. **Engine (`POST /api/quizzes/<slug>/submit`)**: Fail-closed Turnstile verification, consent version check, server-side deterministic re-scoring from answer texts, store-first Firestore persistence (`quizzes`, `submissions`, `sync_log`) with client UUID idempotency + retake tracking, async Gemini email-only paragraph generation with strict validation & template fallback, HubSpot Forms API v3 sync (`hybrid-2026`), retry sweep (`POST /api/admin/retry`), and priority-sorted CSV export.

## Quick start (local)

```bash
npm install
cp .env.example .env
# Edit .env (set ADMIN_TOKEN, USE_MEMORY_STORE=1 for local dev without Firestore)
npm run build
npm start
```

- Admin Builder: `http://localhost:8080/admin`
- Seed quiz is imported automatically on first boot as `draft` (`hybrid-meeting-readiness`). Publish it in `/admin` to view `/q/hybrid-meeting-readiness`.

## Scripts

- `npm run typecheck` — strict TypeScript check (`tsc -p tsconfig.test.json --noEmit`)
- `npm run build` — compile `src/` to `dist/`
- `npm test` — compile tests and run Node's built-in test runner (`node --test`)
- `npm start` — run compiled server (`node dist/server.js`)

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No (default `8080`) | HTTP port (Cloud Run injects `PORT`) |
| `ADMIN_TOKEN` | Yes | Shared secret for `/admin` login & `/api/admin/*` Bearer/cookie auth |
| `TURNSTILE_SITE_KEY` | Yes (prod) | Cloudflare Turnstile public site key |
| `TURNSTILE_SECRET_KEY` | Yes (prod) | Cloudflare Turnstile secret key (submit fails closed if unset) |
| `HUBSPOT_PORTAL_ID` | Yes (sync) | HubSpot portal ID |
| `HUBSPOT_FORM_GUID` | Yes (sync) | HubSpot form GUID (form CAPTCHA must be disabled) |
| `HUBSPOT_REGION` | No (`us` \| `eu`) | `eu` uses `api-eu1.hsforms.com`; otherwise `api.hsforms.com` |
| `GEMINI_API_KEY` | Optional | Google Gemini API key; falls back to template if unset/failing |
| `GEMINI_MODEL` | Optional | Gemini model ID (default `gemini-2.5-flash-lite`) |
| `GOOGLE_CLOUD_PROJECT` | Yes (Firestore) | GCP project ID for Firestore Native mode |
| `USE_MEMORY_STORE` | Optional | Set `1` for in-memory storage in local dev/tests |

## Design notes (choices where the brief was silent)

- **Seed option points**: The supplied `seed-hybrid-meeting-readiness.json` had option points ordered `0, 1, 2, 3` (0 for best, 3 for worst), which conflicted with the reference `scoring.ts` (`return 3 - idx`), Band 4 ("Hybrid ready"), and Acceptance Test 1 (`all-best = 100% Band 4`, `all-worst = 0% Band 1`). `seed/seed-hybrid-meeting-readiness.json` corrects `points` to `3, 2, 1, 0` while keeping all text and `displayOrder` indices unchanged.
- **Schema compatibility**: Both `min`/`max` (seed) and `minPct`/`maxPct` (brief §3) are accepted on bands; both `number[]` (seed) and `string[]` (brief §3) are accepted for `displayOrder`; `renderFallbackParagraph` supports both `{pct}/{band}/{gapNames}/{gapTip}` (seed/`scoring.ts`) and `{score}/{bandLabel}/{bestArea}/{bestPct}/{gapArea}/{gapPct}/{tip}` (brief §3); `closing.livePhase` defaults to `"pre"` if omitted; `profileQuestions[].label` is optional and defaults to readable labels if omitted.
- **Local storage fallback**: When `GOOGLE_CLOUD_PROJECT` and `FIRESTORE_EMULATOR_HOST` are unset (or `USE_MEMORY_STORE=1`), the app uses an in-memory store (`MemoryStore`) so local development and `npm test` work without GCP credentials. In Cloud Run with `GOOGLE_CLOUD_PROJECT` set, it uses Firestore Native mode (`quizzes`, `submissions`, `sync_log`).
- **Firestore pending query**: `listPendingSubmissions` queries on `hubspot_status == "pending"` and filters `sync_attempts < 5` + sorts oldest-first in memory so no manual composite Firestore index is required on a fresh project.
- **Admin session**: Logging in at `/admin/login` issues an `HttpOnly`, `SameSite=Lax` HMAC-SHA256 cookie derived from `ADMIN_TOKEN` (stateless across Cloud Run instances). Automation such as Cloud Scheduler can authenticate with `Authorization: Bearer <ADMIN_TOKEN>`.
- **CORS on submit**: `/api/quizzes/*` allows cross-origin `POST` requests so exported standalone HTML files hosted externally can submit back to this service.

## Docker

```bash
docker build -t sc-quiz-designer .
docker run --rm -p 8080:8080 --env-file .env sc-quiz-designer
```

## Google Cloud Run deployment

### 1. Enable APIs & create Firestore (Native mode)

```bash
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export REGION="asia-southeast1"

gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  --project "$GOOGLE_CLOUD_PROJECT"

# Once per project (Native mode):
gcloud firestore databases create --location="$REGION" --type=firestore-native --project "$GOOGLE_CLOUD_PROJECT"
```

### 2. Store secrets in Secret Manager

```bash
printf '%s' 'REPLACE_ADMIN_TOKEN' | gcloud secrets create ADMIN_TOKEN --data-file=- --project "$GOOGLE_CLOUD_PROJECT"
printf '%s' 'REPLACE_TURNSTILE_SECRET' | gcloud secrets create TURNSTILE_SECRET_KEY --data-file=- --project "$GOOGLE_CLOUD_PROJECT"
printf '%s' 'REPLACE_GEMINI_KEY' | gcloud secrets create GEMINI_API_KEY --data-file=- --project "$GOOGLE_CLOUD_PROJECT"
```

Grant the Cloud Run runtime service account (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com` or a dedicated SA) `roles/datastore.user` and `roles/secretmanager.secretAccessor`.

### 3. Deploy to Cloud Run

```bash
gcloud run deploy sc-quiz-designer \
  --source . \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,TURNSTILE_SITE_KEY=YOUR_SITE_KEY,HUBSPOT_PORTAL_ID=YOUR_PORTAL_ID,HUBSPOT_FORM_GUID=YOUR_FORM_GUID,HUBSPOT_REGION=us,GEMINI_MODEL=gemini-2.5-flash-lite" \
  --set-secrets "ADMIN_TOKEN=ADMIN_TOKEN:latest,TURNSTILE_SECRET_KEY=TURNSTILE_SECRET_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

### 4. Schedule retry sweep (every 10 minutes)

```bash
SERVICE_URL=$(gcloud run services describe sc-quiz-designer --region "$REGION" --project "$GOOGLE_CLOUD_PROJECT" --format='value(status.url)')

gcloud scheduler jobs create http sc-quiz-retry-sweep \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --location "$REGION" \
  --schedule "*/10 * * * *" \
  --uri "${SERVICE_URL}/api/admin/retry" \
  --http-method POST \
  --headers "Authorization=Bearer YOUR_ADMIN_TOKEN"
```

### 5. Map custom domain `hybrid.enablly.com` (Cloud Run + Cloudflare DNS)

1. Verify domain ownership for `enablly.com` in Google Search Console / Cloud Run if not already verified.
2. Create the Cloud Run domain mapping:
   ```bash
   gcloud beta run domain-mappings create \
     --service sc-quiz-designer \
     --domain hybrid.enablly.com \
     --region "$REGION" \
     --project "$GOOGLE_CLOUD_PROJECT"
   ```
3. Inspect the DNS records returned by Cloud Run (`gcloud beta run domain-mappings describe --domain hybrid.enablly.com --region "$REGION"`), typically a `CNAME` pointing `hybrid` to `ghs.googlehosted.com.`.
4. In **Cloudflare DNS** for `enablly.com`:
   - Add the `CNAME` record: Name `hybrid`, Target `ghs.googlehosted.com.`.
   - Keep Cloudflare proxy **DNS only (grey cloud)** while Cloud Run provisions the managed TLS certificate (and optionally keep DNS-only or switch to Proxied with SSL/TLS mode **Full (strict)** once the cert is active).
