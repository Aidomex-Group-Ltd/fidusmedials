# Fidus Medical Center — Cloudflare Workers deployment

## 🎉 Staging

- Worker name: `fidus-staging`
- Staging URL: **https://fidus-staging.aidomexgroupltd.workers.dev**
- Last deploy: `2026-11-25`, version `5e72402a-7fb6-483d-a47e-466fbbb4f8c1`
- Bindings: D1 `fidus-staging-db`, R2 `fidus-documents` (`DOCUMENTS`)
- Migrations `004_patient_clinical_records.sql` and
  `005_beds_and_documents.sql` applied to staging D1.
- `/api/health` verified (HTTP 200); `/api/beds`, `/api/documents` and
  `/api/dashboard/stats` return 401 without a session (routes present).

## 🔒 Security

- Secrets generated with OpenSSL (`openssl rand -hex 32`) and stored in `~/.config/fidus/staging/*`.
- Staging and production secrets are distinct (staging dir: `~/.config/fidus/staging/`, prod dir: `~/.config/fidus/production/`).
- Uploaded via Wrangler (`make wrangler-set`).
- Frontend bundle contains no `localhost:5000` or fake auth strings (verified by fetching the JS asset).

## Production

- Worker name: `fidusmedials` (as configured under `env.production`)
- URLs: **https://fidusmedicals.space** and **https://www.fidusmedicals.space**
- Last deploy: `2026-11-25`, version `35df7061-4f14-48d4-b41b-b848e54ff72c`
- Bindings: D1 `fidusmeduals-prod`, R2 `fidus-documents-prod` (`DOCUMENTS`)
- Secrets set: `JWT_SECRET`, `SESSION_SECRET`, `RESEND_API_KEY`
- Migrations applied: `002`, the production column completion,
  `004_patient_clinical_records.sql`, `005_beds_and_documents.sql`.
- Initial System Administrator: `consult@fidusmedicals.space` (temporary
  password issued separately — change it after first sign-in).
- `/api/health` returns `"version":"production"` on both domains.
- Production e2e passed: admin login, dashboard stats, patient registration and
  login, bed admission/discharge, R2 document upload/download/delete, patient
  isolation, and SSE notifications.
- Resend delivery verified to `lokangtom2017@gmail.com`
  (message id `01a210e6-41c6-71de-9c95-1ae753533334`).

## Tooling

```
make build
make start
make wrangler-deploy --env staging
make wrangler-set KEY=<name> ENV=<env>
make cf-whoami
```

Also: `cf projects list`, `cf workers list`, `cf deployments` (where applicable).

## Pending

- [x] Apply `004_patient_clinical_records.sql` and `005_beds_and_documents.sql`
      to the staging D1 database.
- [x] Create the R2 buckets bound as `DOCUMENTS`: `fidus-documents` (staging)
      and `fidus-documents-prod` (production).
- [x] Deploy backend Worker; `/api/health` verified on staging.
- [x] Frontend is served same-origin by the Worker (`/api`), so no
      `VITE_API_URL` hostname is required.
- [x] Production deployed with custom domains:
      `fidusmedicals.space` and `www.fidusmedicals.space`.
- [x] Resend delivery verified with a real recipient
      (`lokangtom2017@gmail.com`).
- [ ] Rotate the temporary production System Administrator password after the
      first sign-in.
- [ ] Visual/browser verification of the updated layouts (no browser available
      during this pass).
