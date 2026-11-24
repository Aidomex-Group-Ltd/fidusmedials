# Fidus Medical Center — Cloudflare Workers deployment

## 🎉 Staging

- Worker name: `fidus-staging`
- Staging URL: **https://fidus-staging.aidomexgroupltd.workers.dev** (verified via `curl` → HTTP 200 on `/`)

## 🔒 Security

- Secrets generated with OpenSSL (`openssl rand -hex 32`) and stored in `~/.config/fidus/staging/*`.
- Staging and production secrets are distinct (staging dir: `~/.config/fidus/staging/`, prod dir: `~/.config/fidus/production/`).
- Uploaded via Wrangler (`make wrangler-set`).
- Frontend bundle contains no `localhost:5000` or fake auth strings (verified by fetching the JS asset).

## Production

- Worker name: `fidus-production`
- Deployment status: not deployed (never promote staging)
- TODO: deploy via `npx wrangler deploy --env production` and add custom domain after approval.

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

- [ ] Deploy backend Worker and expose `/api/health`.
- [ ] Point `VITE_API_URL` at the deployed staging backend, redeploy, retest.
- [ ] Approve production deployment; add custom domain.
