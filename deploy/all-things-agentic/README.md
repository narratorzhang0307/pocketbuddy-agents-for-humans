# Google Cloud deployment

This deployment keeps AMap as Pocket Buddy's route and map provider. Gemini is the agent decision model; the official Google Gen AI SDK is the agent framework; Cloud Run hosts the application; and Firestore stores privacy-bounded execution evidence.

## Prerequisites

- Node.js 22 or newer
- A Google Cloud project with billing enabled
- `gcloud` authenticated to that project
- A default Firestore Native database
- An AMap Web JS API key configured for the final hosted origin

The deployment script creates a dedicated `frost-agentic-run` service account, grants only `Vertex AI User` and `Cloud Datastore User`, creates an Artifact Registry repository, and creates the default Firestore Native database if any of them are missing. Override `FROST_RUNTIME_SERVICE_ACCOUNT`, `FROST_ARTIFACT_REPOSITORY`, or `FROST_FIRESTORE_LOCATION` before running it when the project requires different names or locations.

To create Firestore manually instead, select the permanent database location carefully:

```sh
gcloud firestore databases create --database='(default)' --location=nam5 --type=firestore-native
```

If IAM must be managed outside the script, grant the Cloud Run service identity these minimum roles:

```sh
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member='serviceAccount:RUNTIME_SERVICE_ACCOUNT' \
  --role='roles/aiplatform.user'
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member='serviceAccount:RUNTIME_SERVICE_ACCOUNT' \
  --role='roles/datastore.user'
```

## Build and verify locally

Copy `.env.example` to `.env.local`, keep AMap enabled, and configure either Vertex AI application-default credentials or a Gemini API key. Never commit that file.

```sh
npm ci
npm run typecheck
npm test -- --maxWorkers=2
npm run build
```

## Deploy

From the repository root:

```sh
export GOOGLE_CLOUD_PROJECT='YOUR_PROJECT_ID'
export GOOGLE_CLOUD_REGION='us-central1'
export VITE_AMAP_KEY='YOUR_HOST_RESTRICTED_AMAP_WEB_KEY'
export VITE_AMAP_SERVICE_HOST='https://YOUR_HOST/_AMapService'
./deploy/all-things-agentic/deploy.sh
```

The existing AMap security-code mode is also supported when a production proxy cannot be added before the deadline: export `VITE_AMAP_SECURITY_JSCODE` instead of `VITE_AMAP_SERVICE_HOST`. Keep the AMap key restricted to the final Cloud Run origin in either mode.

The script uses Cloud Build to build the root `Dockerfile`, pushes the immutable commit-tagged image to Artifact Registry, deploys it to Cloud Run, and prints the service URL. It does not upload `.env` files or server API keys. The AMap browser key is compiled into the public client bundle by design and therefore must be host-restricted; Vertex AI and Firestore use the dedicated Cloud Run service identity. The unrelated pet-image upload API is disabled in this minimal judging container, reducing runtime dependencies and attack surface without changing the submitted Taskmaster workflow.

Verify the public, non-secret evidence endpoints:

```sh
curl -fsS "CLOUD_RUN_URL/healthz"
curl -fsS "CLOUD_RUN_URL/api/agentic-readiness"
```

For the submission video, show the Cloud Run revision, one `frost.agent.completed` log line, and the matching `frost_agent_runs/{traceId}` Firestore document. The stored document contains execution metadata only; prompts, health context, API keys, and model reasoning are not persisted.
