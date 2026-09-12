#!/usr/bin/env bash
# Rebuild the combined app and update an EXISTING Cloud Run service.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${GOOGLE_CLOUD_PROJECT:?Set the existing Google Cloud project ID}"
: "${GOOGLE_CLOUD_REGION:?Set the existing service region}"
: "${FROST_CLOUD_RUN_SERVICE:?Set the existing Cloud Run service name}"
: "${VITE_AMAP_KEY:?Set the host-restricted AMap Web JS key}"
if [[ -z "${VITE_AMAP_SERVICE_HOST:-}" && -z "${VITE_AMAP_SECURITY_JSCODE:-}" ]]; then
  echo 'Set VITE_AMAP_SERVICE_HOST or VITE_AMAP_SECURITY_JSCODE for the frontend build.' >&2
  exit 2
fi
command -v gcloud >/dev/null
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
if [[ -n "$(git status --porcelain)" || "$(git branch --show-current)" != main ]]; then
  echo 'Deploy a clean main checkout; commit changes and pull --ff-only first.' >&2
  exit 2
fi
if [[ ! "$(git remote get-url origin)" =~ ^(https://github\.com/|git@github\.com:)narratorzhang0307/pocketbuddy-agents-for-humans(\.git)?$ ]]; then
  echo 'This update must use narratorzhang0307/pocketbuddy-agents-for-humans.' >&2
  exit 2
fi
run_sha="$(git rev-parse HEAD)"
run_remote_sha="$(git ls-remote origin refs/heads/main | cut -f1)"
if [[ "$run_sha" != "$run_remote_sha" ]]; then
  echo 'Local HEAD differs from published main; synchronize before deploying.' >&2
  exit 2
fi
run_repository="${FROST_ARTIFACT_REPOSITORY:-frost-agentic}"
run_image="${GOOGLE_CLOUD_REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${run_repository}/${FROST_CLOUD_RUN_SERVICE}:${run_sha}"
run_url="$(gcloud run services describe "$FROST_CLOUD_RUN_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='value(status.url)')"
if [[ -z "$run_url" ]]; then
  echo 'Existing service URL unavailable. See deploy/cloud-run/README.md for first deployment.' >&2
  exit 2
fi
gcloud artifacts repositories describe "$run_repository" --location "$GOOGLE_CLOUD_REGION" --project "$GOOGLE_CLOUD_PROJECT" >/dev/null
echo "Building published commit $run_sha for $run_url"
echo 'Current traffic (record for rollback):'
gcloud run services describe "$FROST_CLOUD_RUN_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" --format='yaml(status.traffic)'

gcloud builds submit . --config deploy/all-things-agentic/cloudbuild.yaml \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --substitutions "_IMAGE=${run_image},_VITE_AMAP_KEY=${VITE_AMAP_KEY},_VITE_AMAP_SERVICE_HOST=${VITE_AMAP_SERVICE_HOST:-},_VITE_AMAP_SECURITY_JSCODE=${VITE_AMAP_SECURITY_JSCODE:-},_POCKET_BUDDY_PUBLIC_ORIGIN=${POCKET_BUDDY_PUBLIC_ORIGIN:-https://pocketbuddy.throughtheglass.art}"

# Preserve the model, secret bindings, service account, Firestore, IAM and scaling.
# Only the combined container's runtime settings and capacity are updated here.
gcloud run services update "$FROST_CLOUD_RUN_SERVICE" \
  --image "$run_image" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --port 8080 --cpu 2 --memory 2Gi --concurrency 8 --timeout 300 \
  --startup-probe 'httpGet.path=/api/sports-coach/health,httpGet.port=8080,timeoutSeconds=10,periodSeconds=10,failureThreshold=12' \
  --update-env-vars 'SPORTS_COACH_PYTHON=/opt/sports-venv/bin/python,API_HOST=0.0.0.0,API_PORT=8080,FROST_PET_API_ENABLED=false,HEALTH_SKILL_LOCAL_BRIDGE=false,TRUST_PROXY=true'

gcloud run services describe "$FROST_CLOUD_RUN_SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
  --format='yaml(status.url,status.latestReadyRevisionName,status.traffic)'
echo "Next: node deploy/cloud-run/verify.mjs --url $run_url --model"
echo 'If traffic is pinned to an older revision, follow the traffic step in deploy/cloud-run/README.md.'
