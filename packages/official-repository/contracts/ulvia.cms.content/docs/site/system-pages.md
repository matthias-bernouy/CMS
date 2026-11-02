# Configure system Pages

Use `site.get` and `site.update` to select ordinary site-owned Pages for these roles:

| Field | Role |
| --- | --- |
| `notFound` | Missing content, returned with status 404; gone routes also use it with status 410. |
| `forbidden` | Access denied to an authenticated visitor, returned with status 403. |
| `serverError` | Server rendering errors, returned with status 500 or 503. |
| `login` | Public login Page used to redirect anonymous visitors who need authentication. |

## Select or clear a Page

1. Read `site.get` to obtain the current settings and `revision`.
2. Find or create the target Page using `pages.list`, `pages.get` or `pages.create`.
3. Call `site.update` with `expectedRevision` and the fields to change. Each non-null
   reference is `{ "pageId": "<stable-page-id>" }`; paths such as
   `/404` are not references. The official Provider requires the Page to exist in
   the current instance. Another instance's Page ID does not select its content.
4. Omit a field to preserve its selection, or pass `null` to clear it. A command
   must contain at least one settings change. Multiple selections can change in
   one revision-controlled command.
5. Read `site.get` again and verify the affected selections. On
   `REVISION_CONFLICT`, reread the settings and review changes before retrying.

```json
{
  "expectedRevision": 4,
  "notFound": { "pageId": "missing-page" },
  "forbidden": null
}
```

The example is the capability input. MCP wraps it under `input`.

## Publication and delivery

Selecting a Page does not publish it or change its content. Draft Pages may be
selected in preparation, but error fallbacks render published content only and
retain their access checks. Without a usable error Page, delivery falls back to
plain text. A restricted fallback must not expose private content anonymously.

The login Page must be published and accessible anonymously. Redirects include
`returnTo`; preserve the authentication bindings when editing its content. Clearing
`login` removes that redirect target; requests requiring authentication then return
503 when no login target can be resolved.

Naming a Page `/404`, `/403` or `/login` does not assign its role. These settings
do not configure a maintenance Page. Technical upgrade maintenance has its own
response and does not use `serverError`.

Use an actual HTTP or browser check to verify fallback status, rendered content
and login redirects. Successful settings writes alone do not verify delivery.
