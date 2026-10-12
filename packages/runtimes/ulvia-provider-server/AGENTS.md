# @bernouy/ulvia-provider-server

Production runtime for the official Ulvia Provider.

- Read and validate Provider environment configuration here.
- Compose only the persistence and provider-management adapters required by
  the official contracts. Never depend on the Kernel runtime or a shared
  aggregate instance runtime.
- Import the exact admitted official manifest before mounting the Provider.
- Mount only the `@bernouy/ulvia-provider` surface; never mount or start the
  CMS Kernel.
- Never log Provider tokens or instance secrets.
