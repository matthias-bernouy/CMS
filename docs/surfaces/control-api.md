# Control API Routing

`@bernouy/cms-control` routes `src/api/` through
`src/core/admin/registerEndpoints/serveApiFolder.ts`. This is a file router for the
admin REST API mounted under `<basePath>/api`.

## File Names

Endpoint files use:

```text
<path>.<method>.ts
```

Allowed methods are `GET`, `POST`, `PUT`, `DELETE`, and `PATCH`, written in the
filename as lowercase or uppercase before `.ts`.

Examples:

| File | Route |
| --- | --- |
| `page/page.get.ts` | `GET /page` |
| `_content/page/_editing/configDetail.get.ts` | `GET /page/configDetail` |
| `files/upload.post.ts` | `POST /files/upload` |
| `tags.get.ts` | `GET /tags` |

The router omits directory segments beginning with `_`, then collapses a
duplicated directory/file segment. `dir/dir.get.ts` becomes `/dir`;
`_content/page/_routes/paths.get.ts` becomes `/page/paths`. Otherwise the
relative path before `.<method>.ts` becomes the route.

Files without a valid `.<method>.ts` suffix are ignored by the router. Helper
files should therefore avoid HTTP method suffixes.

If two files declare the same `METHOD /route`, boot fails with a conflict error.

## Handler Shape

Each endpoint default-exports a function:

```ts
import type { ControlCms } from "cms-control/ControlCms";

export default async function handler(req: Request, cms: ControlCms): Promise<Response> {
    return new Response();
}
```

Use `cms` as the second parameter name. Prefix unused parameters with `_`.

## Endpoint Responsibilities

Keep endpoint files thin:

- The global Control guard establishes authentication only. Administrative
  routes are administrator-only by default. The API boundary allows members
  only their profile, personal tokens, assigned dashboard catalogue, dashboard
  views and dashboard binding context. High-impact handlers also call
  `requireControlAdministrator(req, cms)` before parsing input or accessing
  administrative state.
- Parse the request with shared helpers such as `readJsonBody`.
- Validate DTOs through `src/core/validation/<resource>/parse*Dto.ts`.
- Delegate mutations to the owning domain under `src/core/content/`,
  `src/core/admin/`, or its feature package.
- Return JSON with an explicit `Content-Type` header when a body is present.
- Throw `MissingParam` or `InvalidParam` for bad input.

Do not inline business rules, repository mutation workflows, or large response
projections in `src/api/`. Move them to `src/core/`.

## Imports

Use the `cms-control/...` alias for package-internal imports:

```ts
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
```

Do not use long relative paths from endpoint files.
