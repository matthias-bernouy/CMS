# API Folder

`@bernouy/cms-control` routes `src/api/` through
`src/core/registerEndpoints/serveApiFolder.ts`. This is a file router for the
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
| `page/configDetail.get.ts` | `GET /page/configDetail` |
| `files/upload.post.ts` | `POST /files/upload` |
| `tags.get.ts` | `GET /tags` |

The router collapses a duplicated directory/file segment. `dir/dir.get.ts`
becomes `/dir`; otherwise the relative path before `.<method>.ts` becomes the
route.

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

- Parse the request with shared helpers such as `readJsonBody`.
- Validate DTOs through `src/core/validation/<resource>/parse*Dto.ts`.
- Delegate mutations to `src/core/<resource>/<action>.ts`.
- Return JSON with an explicit `Content-Type` header when a body is present.
- Throw `MissingParam` or `InvalidParam` for bad input.

Do not inline business rules, repository mutation workflows, or large response
projections in `src/api/`. Move them to `src/core/`.

## Imports

Use the `cms-control/...` alias for package-internal imports:

```ts
import { readJsonBody } from "cms-control/core/http/readJsonBody";
```

Do not use long relative paths from endpoint files.
