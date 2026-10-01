# JINSUL authenticated Cloudflare portal

Production: https://jinsul-portal.xginini.workers.dev/

Build from this directory with npm run build. It reads the latest original HTML, HIRA price table, logo and XLSX library from the repository parent directory; existing calculation code is preserved. Shared design and locally hosted Paperlogy fonts live in public/. The production command is npx wrangler deploy --config wrangler.production.jsonc.

Cloudflare Builds root: /secure-portal. Build command: npm run build. Deploy command: npx wrangler deploy --config wrangler.production.jsonc. Runtime D1 binding DB uses jinsul-accounts. PASSWORD_PEPPER is a Cloudflare runtime secret; do not replace it after accounts are created. Account secrets are never committed.

The original GitHub Pages deployment job is removed to avoid publishing an unauthenticated copy. Scheduled HIRA retrieval and its regression checks remain. Changes to the root price table are built into the authenticated Worker via Cloudflare Git integration. Previously published Pages must also be unpublished in repository Settings / Pages.

Accounts: the owner has created the first administrator. Administrators create/suspend staff, reset temporary passwords and grant access by 업무 분류. The temporary bootstrap secret is removed after initial setup. Existing statistical calculations and browser-local storage remain; full real-data regression is not performed.

Source bundle verification: 17 automatic tests and Cloudflare workerd/D1 login, revocation and authorization checks passed. 27 tools inspected in the browser. Production unauthenticated routes and font assets are checked after deployment.
