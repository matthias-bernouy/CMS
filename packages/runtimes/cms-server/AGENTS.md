# @bernouy/cms-server

Production runtime composition root.

## Responsibilities

- Read environment variables.
- Connect MongoDB.
- Instantiate crypto, repositories, stores, auth, rate limiting, gateway,
  analytics, cache, files, Control, and Delivery.
- Start one Control runner and one Delivery runner.

## Rules

- This is the correct place to import `./mongo` and `./s3` adapter subpaths.
- Validate required environment early and fail fast.
- Never log secrets, passwords, PATs, KEKs, DEKs, or session signing material.
- Be careful with `SCOPE_ID`; changing it after data exists can make encrypted
  data unreadable.
- Keep startup order explicit. Many stores require `init()` before being passed
  to surfaces.
- Changes here usually need an integration-style test or a clear manual
  verification path.
