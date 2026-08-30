# Submission checklist

## Devpost

- [ ] Select **The Taskmaster**
- [ ] Add every eligible team member and appoint one representative
- [ ] Confirm any Taiwan-resident team member is at least 20 years old
- [ ] Paste the English description from `DEVPOST_SUBMISSION.md`
- [ ] Add hosted Cloud Run URL
- [ ] Add GitHub repository URL
- [ ] If the repository stays private, invite `testing@devpost.com` and `cloudhackathons@google.com`
- [ ] Add public YouTube/Vimeo video URL
- [ ] Upload or link `ARCHITECTURE.svg`
- [ ] List AMap and all other third-party data sources
- [ ] Include the pre-existing work disclosure

## Repository

- [ ] Default `main` contains the submitted commit
- [ ] README links this competition package
- [ ] `npm ci`, typecheck, tests, build, and agentic verification pass
- [ ] No `.env`, credentials, private evidence, personal media, model weights, or build caches tracked
- [ ] Cloud Run and local spin-up instructions are reproducible
- [ ] Taiwan operator ran `npm run agentic:preflight` with `passed: true`

## Cloud proof

- [ ] `/healthz` names Gemini and `@google/genai`
- [ ] `/api/agentic-readiness` returns `ok: true`
- [ ] Readiness reports Prompt Harness v1 and Firestore `required: true`
- [ ] Cloud Run revision visible
- [ ] `frost.agent.completed` log visible
- [ ] Matching Firestore trace document visible
- [ ] AMap route works on the hosted origin

## Video

- [ ] 4:00 or shorter
- [ ] Public YouTube or Vimeo
- [ ] English narration or complete English subtitles
- [ ] Live action workflow shown
- [ ] Google Cloud backend proof shown
- [ ] No secrets or personal health/location data visible
- [ ] Freeze the judged repository and hosted build after the deadline until winners are announced
- [ ] Do not upload identity documents, credentials, personal health data, or exact home location to Git/Devpost media
