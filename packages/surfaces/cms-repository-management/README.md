# @bernouy/cms-repository-management

Authenticated HTTP surface for managing the global CMS integration repository.

The initial package export provides the management request boundary. It checks
an exact Bearer service token, then applies an injected rate limiter keyed by the
authenticated service principal before invoking a route handler. Publication
routes and registry adapters are composed separately.

```ts
import { createRepositoryManagementGuard } from "@bernouy/cms-repository-management";

const guard = createRepositoryManagementGuard({
    serviceToken: process.env.REPOSITORY_MANAGEMENT_TOKEN!,
    servicePrincipal: "repository-operator",
    rateLimiter,
});

runner.group("/.cms/repository-management", mountRoutes, [guard]);
```

The `./gateway` export provides the separate CMS-facing boundary used by the
designated repository manager. It authenticates an ordinary CMS subject,
requires the configured administrator role, forwards only an exact allow-list
of operator routes, and leaves maintenance and verifier routes private. Its
transport replaces the incoming CMS PAT with the standalone repository's
server-side credential.
