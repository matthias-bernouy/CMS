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
