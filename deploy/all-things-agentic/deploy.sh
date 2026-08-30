#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT to the competition project id}"
: "${VITE_AMAP_KEY:?Set VITE_AMAP_KEY to the host-restricted AMap Web JS key}"
if [[ -z "${VITE_AMAP_SERVICE_HOST:-}" && -z "${VITE_AMAP_SECURITY_JSCODE:-}" ]]; then
  echo 'Set VITE_AMAP_SERVICE_HOST (preferred) or VITE_AMAP_SECURITY_JSCODE for the existing AMap integration.' >&2
  exit 2
fi

agentic_region="${GOOGLE_CLOUD_REGION:-us-central1}"
agentic_location="${GOOGLE_CLOUD_LOCATION:-global}"
agentic_service="${FROST_CLOUD_RUN_SERVICE:-frost-taskmaster-agent}"
agentic_repository="${FROST_ARTIFACT_REPOSITORY:-frost-agentic}"
agentic_runtime_account="${FROST_RUNTIME_SERVICE_ACCOUNT:-frost-agentic-run}"
agentic_firestore_location="${FROST_FIRESTORE_LOCATION:-nam5}"
agentic_tag="$(git rev-parse --short=12 HEAD)"
agentic_image="${agentic_region}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${agentic_repository}/${agentic_service}:${agentic_tag}"
agentic_runtime_email="${agentic_runtime_account}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com firestore.googleapis.com \
  --project "$GOOGLE_CLOUD_PROJECT"

if ! gcloud artifacts repositories describe "$agentic_repository" --location "$agentic_region" --project "$GOOGLE_CLOUD_PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$agentic_repository" \
    --repository-format docker \
    --location "$agentic_region" \
    --project "$GOOGLE_CLOUD_PROJECT"
fi

if ! gcloud iam service-accounts describe "$agentic_runtime_email" --project "$GOOGLE_CLOUD_PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$agentic_runtime_account" \
    --display-name 'Frost Agentic Cloud Run runtime' \
    --project "$GOOGLE_CLOUD_PROJECT"
fi

gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member "serviceAccount:${agentic_runtime_email}" \
  --role roles/aiplatform.user \
  --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member "serviceAccount:${agentic_runtime_email}" \
  --role roles/datastore.user \
  --condition=None >/dev/null

if ! gcloud firestore databases describe --database='(default)' --project "$GOOGLE_CLOUD_PROJECT" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database='(default)' \
    --location="$agentic_firestore_location" \
    --type=firestore-native \
    --project "$GOOGLE_CLOUD_PROJECT"
fi

gcloud builds submit . \
  --config deploy/all-things-agentic/cloudbuild.yaml \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --substitutions "_IMAGE=${agentic_image},_VITE_AMAP_KEY=${VITE_AMAP_KEY},_VITE_AMAP_SERVICE_HOST=${VITE_AMAP_SERVICE_HOST:-},_VITE_AMAP_SECURITY_JSCODE=${VITE_AMAP_SECURITY_JSCODE:-}"

gcloud run deploy "$agentic_service" \
  --image "$agentic_image" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$agentic_region" \
  --service-account "$agentic_runtime_email" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min 0 \
  --max 3 \
  --set-env-vars "FROST_AGENT_PROVIDER=gemini,GEMINI_MODEL=gemini-3.5-flash,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,GOOGLE_CLOUD_LOCATION=$agentic_location,GOOGLE_CLOUD_REGION=$agentic_region,FROST_FIRESTORE_ENABLED=true,FROST_FIRESTORE_REQUIRED=false,FROST_FIRESTORE_COLLECTION=frost_agent_runs,FROST_PET_API_ENABLED=false,EDGE_BACKEND=stub,HEALTH_SKILL_LOCAL_BRIDGE=false,TRUST_PROXY=true"

gcloud run services describe "$agentic_service" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$agentic_region" \
  --format='value(status.url)'
