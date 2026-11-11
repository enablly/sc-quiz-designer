#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
REGION="${REGION:-asia-southeast1}"
SERVICE_NAME="${SERVICE_NAME:-sc-quiz-designer}"

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project "${GOOGLE_CLOUD_PROJECT}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},HUBSPOT_REGION=${HUBSPOT_REGION:-us},GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.5-flash-lite}"
