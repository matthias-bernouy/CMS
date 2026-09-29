# Dynamic Page Indexing

A published page can resolve a dynamic entity through a selected gateway
capability. The page owns its indexing projection; provider installations do not
own CMS metadata or sitemap rules. No `/.cms/sources` route is involved.

The page's `cms-source` binding calls `/.cms/call/<contractId>/<capabilityId>`
with `cms-source-method="POST"`. A `cms-source-body` field whose source is a page
query parameter identifies a candidate in Control. The candidate must be a
selected synchronous query with a scalar canonical identity field in its output
schema. Control suggests a candidate when exactly one is present and requires a
choice when several are present.

Page settings store `indexing.enabled` and an optional `indexing.entity`:

```json
{
  "enabled": true,
  "entity": {
    "contractId": "commerce",
    "label": "Product",
    "pageQueryParam": "product",
    "resolve": {
      "capabilityId": "product.get",
      "inputParam": "slug",
      "identityPath": "slug"
    },
    "discover": {
      "capabilityId": "product.list",
      "itemsPath": "items",
      "identityPath": "slug",
      "lastModifiedPath": "updatedAt",
      "pagination": {
        "type": "offset",
        "limitParam": "limit",
        "offsetParam": "offset",
        "pageSize": 100,
        "totalPath": "total"
      }
    },
    "variables": {
      "title": { "path": "title", "type": "text" }
    }
  }
}
```

`resolve` receives the single public query value and projects the canonical
identity and declared `${content.*}` metadata variables. Missing or duplicate
query values render the base page with `noindex` and no canonical URL. A provider
404 renders the not-found response; invalid identity responses preserve 400 or
422. Other provider failures make the page temporarily unavailable.

`discover` is optional. Configure a selected **public query** capability to
publish dynamic URLs in sitemap snapshots. Its `itemsPath` must point to an
array; `identityPath` and optional `lastModifiedPath` are relative to each item.
Offset and cursor pagination are bounded and reject loops or malformed output.
Control validates the projection paths against the selected contract schemas.
Discovery runs anonymously so it cannot expose visitor-specific paths.

A page with dynamic resolution but no `discover` remains absent from the
sitemap. Static pages and localized paths keep their existing sitemap behavior.
The page settings UI exposes the discovery capability, projection fields, and
pagination. The page config API also accepts the complete `indexing` object.
Stored Source URNs and Source entity IDs are not accepted by this contract.
