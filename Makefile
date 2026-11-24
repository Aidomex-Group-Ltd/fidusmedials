# HMS-Frontend tooling (HMS project repo)
# Usage: make start | make build | make dev | make lint | make clean | make cf-whoami | make cf-projects

.PHONY: start dev build lint clean

PORT ?= 5173

# Start the Vite development server (default port 5173).
start:
	@echo "Starting development server at http://localhost:$(PORT)"
	npx vite --port $(PORT) --host

dev: start

# Production build into dist/.
build:
	npm run build

# Lint with oxlint.
lint:
	npx oxlint

# List authenticated Cloudflare user.
cf-whoami:
	cf auth whoami

# List Workers projects.
cf-projects:
	cf projects list

# Set Wrangler secret for a given env (usage: make wrangler-set k env).
wrangler-set:
	@echo "usage: make wrangler-set KEY=<name> ENV=<env>"
	test -z "$(ENV)" || test -n "$(KEY)" || echo "missing KEY/ENV"
	npx wrangler secret put "$(KEY)" --name fidus-$(ENV)

# Deploy wrangler Worker.
wrangler-deploy:
	npx wrangler deploy --env $(ENV)

# Dry-run deploy.
wrangler-deploy-dry:
	npx wrangler deploy --dry-run --env $(ENV)

# Provision D1 database (Fidus staging).
d1-create:
	@echo "Creating D1 db id=fidus-staging-db"
	npx wrangler d1 create fidus-staging-db 2>&1 | tail -20

# Redeploy staging (prints URL).
wrangler-redeploy-staging:
	npx wrangler deploy --name fidus-staging 2>&1 | grep -E "https://|Success"

# Create OpenSSL secret dir.
gen-secrets:
	umask 077; mkdir -p ~/.config/fidus/staging ~/.config/fidus/production
	for s in staging production; do for k in session_secret jwt_secret api_internal_secret audit_signing_key; do openssl rand -hex 32 > ~/.config/fidus/$s/$k; chmod 600 ~/.config/fidus/$s/$k; done; done

# Remove build output.
clean:
	rm -rf dist
