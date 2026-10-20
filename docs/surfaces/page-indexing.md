# Dynamic Page Indexing

A published page can resolve a dynamic entity through a selected gateway
capability. The page owns its indexing projection; provider installations do not
own CMS metadata or sitemap rules. No `/.cms/sources` route is involved.

The Page's browser `cms-query` binding identifies
`<contractId>:<capabilityId> as <alias>`. A `cms-query-input` field whose source
is a synchronized `@param:` state identifies a candidate in the administration UI:

```html
<main
  cms-query="commerce:product.get as product"
  cms-query-input='{"slug":{"from":"state","key":"@param:commerce-product"}}'
></main>
```

The picker matches selected
query capabilities with an object output containing a property named like the
bound input. Saving additionally checks scalar input/identity types and the
configured projection paths. The UI suggests a candidate when exactly one is
present and requires a choice when several are present.

`cms-seo` resolves metadata through a separate server-side call to the injected
gateway runtime. The Kernel supplies the authenticated actor adapter; it does
not fetch its own public `/.cms/call` route or render the browser binding's
result into page content.

Page settings store `indexing.enabled` and an optional `indexing.entity`:

```json
{
  "enabled": true,
  "entity": {
    "contractId": "commerce",
    "label": "Product",
    "pageQueryParam": "commerce-product",
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
The administration flow validates identity, discovery and pagination projection paths against
the selected contract schemas. Discovery must use the same contract as resolution.
Discovery runs anonymously so it cannot expose visitor-specific paths.

A page with dynamic resolution but no `discover` remains absent from the
sitemap. Static pages and localized paths keep their existing sitemap behavior.
The page settings UI exposes the discovery capability, projection fields, and
pagination. The page config API also accepts the complete `indexing` object.
Gateway URLs, Source URNs, and Source entity IDs are not accepted by this
contract. Candidate detection is transport-independent.

## Current Limits

Resolution sends one page-query value as a **string**, under the configured
input key. It does not coerce numeric identities or copy the browser query's
other logical inputs. A schema accepted by the settings validator can therefore still
fail execution when it requires numbers, nested input objects or additional
required fields. Use a resolver accepting one string identity for this path.

Candidate detection is narrower than the general projection model: it expects
the initial output identity property to have the bound input's name. A custom
identity projection does not widen that picker detection. The metadata result
and the browser request have separate execution/error paths.

See [candidate detection](../../packages/features/cms-content/src/pages/core/indexing/detection.ts),
[SEO resolution](../../packages/features/cms-seo/src/indexing/resolvePageIndexingMetadata.ts),
[gateway execution](../../packages/features/cms-seo/src/indexing/executeIndexingCapability.ts),
and the [Kernel adapter](../../packages/surfaces/cms-kernel/src/http/pages/resolvePageIndexing.ts).
