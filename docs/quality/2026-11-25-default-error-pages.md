# Default HTTP error documents — 2026-11-25

## Behavior

Public requests without a usable instance-owned error Page now receive a
self-contained HTML document. Missing/gone Pages keep 404/410, rendering
failures keep 500, and unavailable content/hosting keeps 503. Configured published
Pages retain priority and their existing access checks. Draft/private content does
not become public. Unknown/inactive hosts never borrow another tenant's content.
Technical protocol refusals and non-Page methods retain their existing handling.

The visual direction follows the public [Cyaxis site](https://cyaxis.fr/): white
background, black typography, orange `#f4511e`, rectangular actions and generous
spacing. The final copy uses direct labels such as “Page introuvable”, “Site indisponible”,
“Page not found” and “Site unavailable”. The error document uses only inline CSS
and system fonts. It has no
scripts, external assets, forms or dependency on CMS persistence. Built-in links
return to `/` or retry the current address without inserting request data.

French and English documents are prepared once per host module. A known Page
language wins; otherwise supported `Accept-Language` preferences are ranked by
quality and original order. Regional tags resolve to `fr` or `en`; unsupported or
unusable preferences fall back to English. Parsing bounds 4096 header characters
and the first 32 entries. Responses carry `Content-Language`,
`Vary: Accept-Language`, no-store and noindex. HEAD remains bodyless and
conditional requests keep the error status. Custom Pages are not translated by
this mechanism.

## Ownership and downtime

`@bernouy/http-runner/html` owns the generic, browser-safe document factory,
negotiation and static response helper. Documents have no logo, brand name or
platform credit, including in their HTML title. Foundation contains no CMS state. Content owns configured Page lookup and chooses the static
fallback. The Edge surface owns public host/resource failure responses. The shared
Edge runtime reuses that surface without importing Content or a renderer.

During a complete upgrade, the existing snapshot worker still writes the English
built-in sentinel when no custom Page can be captured. The CLI recognizes only
that exact code-owned document during preparation. Those sites use the same
bilingual generic response as unknown hosts; authored snapshots remain static.
No snapshot schema or stored contract coordinate changes.

The pinned Caddy templates handler evaluates only the code-owned default document
and a bounded language-selection expression. It is never mounted around authored
HTML, CSS or assets. Header values select fixed `en`/`fr` strings, never template
source. Its file root is a nonexistent temporary directory. Actual Caddy tests
prove that header and authored `{{...}}` text cannot execute template functions or
read a private sentinel. See Caddy's [templates guidance](https://caddyserver.com/docs/caddyfile/directives/templates).
The existing listener handoff and certificate-renewal limits remain unchanged.

## Evidence and cost

Initial `bun run check` passed all ten gates before edits. Focused delivery,
Edge and hosting tests passed 139 tests / 915 assertions before the additional
localized host tests. The targeted generic/maintenance run passed 11 tests / 202
assertions, including the actual pinned Caddy. Full verification is recorded in
`artifacts/default-errors-verify-final.log` and finished with exit code 0, including
historical process crashes, Access, Forms, native Edge/backup/restart and fresh /
restarted ACME TLS. That broad run covered the delivery/language changes; the final
branding removal and copy revision then passed 24 focused tests / 324 assertions
and all ten static gates. The final Provider image probe is recorded separately
in `artifacts/default-errors-provider-current-tests.log`.

Relevant tests:

- Foundation `tests/http/errorDocument.test.ts`: fixed unbranded documents, rejected unsupported languages,
  language ordering/quality/exclusions, HEAD, error status and safe headers.
- Content `rendering/renderRef.test.ts`: private/draft refusal, language selection
  and explicit Page-language precedence without leaking request data.
- Edge runtime `hosting/dispatch/error-pages.test.ts`: localized unknown/unavailable
  hosts, zero tenant construction, bodyless protocol refusals and private diagnostics.
- CLI `maintenance/presentation/language.native.test.ts`: real Caddy negotiation,
  custom Page priority, template injection isolation and bodyless HEAD.

Contract/collection maintenance also negotiates built-in defaults after reopening
its persisted snapshot. That path keeps its single projected database read;
authored snapshots are unchanged. The focused maintenance tests passed 8 tests
and 57 assertions before the final copy revision.

No new database, Gateway or network operation runs on the built-in response path.
The existing Page-reference lookup is unchanged; Edge failures still fail before
constructing another tenant. Document strings are bounded immutable module data,
not an expanding per-request cache. No performance measurement campaign is claimed.
The existing 201-line `serveRenderablePage.ts` remains cohesive; this task only
forwards the already-resolved language at two error call sites.

## Preview

The development-only preview serves the exact shared document generator on
loopback. `/fr/404`, `/fr/503`, `/en/404` and `/en/503` force a known Page language;
`/404` and `/503` negotiate the browser header. These preview paths are not new
production routes. Screenshots cover desktop and mobile layouts; the mobile
inspection had no horizontal overflow at 389 CSS pixels.
