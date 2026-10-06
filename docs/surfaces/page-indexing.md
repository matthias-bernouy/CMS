# Dynamic Page Indexing

A published page can resolve a dynamic entity through a selected gateway
capability. The page owns its indexing projection; provider installations do not
own CMS metadata or sitemap rules. No `/.cms/sources` route is involved.

The page's browser `cms-source` binding calls `/.cms/call/<contractId>/<capabilityId>`
with `cms-source-method="POST"`. A `cms-source-body` field whose source is a page
query parameter identifies a candidate in Control. The picker matches selected
query capabilities with an object output containing a property named like the
bound input. Saving additionally checks scalar input/identity types and the
configured projection paths. Control suggests a candidate when exactly one is
present and requires a choice when several are present.

Delivery resolves SEO metadata through a separate server-side call directly to
the gateway. It does not fetch its own public `/.cms/call` route or render the
browser binding's result into page content.

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
Control validates identity, discovery and pagination projection paths against
the selected contract schemas. Discovery must use the same contract as resolution.
Discovery runs anonymously so it cannot expose visitor-specific paths.

A page with dynamic resolution but no `discover` remains absent from the
sitemap. Static pages and localized paths keep their existing sitemap behavior.
The page settings UI exposes the discovery capability, projection fields, and
pagination. The page config API also accepts the complete `indexing` object.
Stored Source URNs and Source entity IDs are not accepted by this contract.

## Current Limits

Resolution sends one page-query value as a **string**, under the configured
input key. It does not coerce numeric identities or copy the browser binding's
other inputs. A schema accepted by the settings validator can therefore still
fail execution when it requires numbers, nested input objects or additional
required fields. Use a resolver accepting one string identity for this path.

Candidate detection is narrower than the general projection model: it expects
the initial output identity property to have the bound input's name. A custom
identity projection does not widen that picker detection. The metadata result
and the browser request have separate execution/error paths.

See [candidate detection](../../packages/features/cms-content/src/pages/core/indexing/detection.ts),
[Delivery resolution](../../packages/surfaces/cms-delivery/src/core/seo/indexing/resolvePageIndexingMetadata.ts)
and [gateway execution](../../packages/surfaces/cms-delivery/src/core/seo/indexing/executeIndexingCapability.ts).
