# Bootstrap recipe discovery

Repository 1.3 provides `bootstrap-recipes` through `QUERY /v1/recipes`.
Send `limit` (1–64), an optional `locale`, and the opaque `cursor` from the preceding page.
The response contains `items` and `cursor`; an empty cursor ends discovery.
Each item contains an exact collection/recipe root, localized label and description,
and Page/include counts. Regional locales fall back to the collection default.

Only recipes from each collection’s latest non-yanked stable release are included.
Collections without recipes do not consume result slots. Cursors bind the current
recipe index and canonical locale; restart discovery after HTTP 409. Metadata is
only a discovery hint. Explicit initialization planning rechecks complete releases,
assets, execution authority and proposed Pages before any business writes.

Publication writes small derived recipe projections before exposing a release.
Registry composition explicitly prepares missing projections from verified latest
metadata; it does not scan historical document contents or alter collections.
Ordinary discovery never generates missing projections. Invalid stored projections
refuse without repair. A per-Registry cache has one shared pending load, at most
10,000 latest collection references and 64 MiB of charged projection text. It is
invalidated after publication or yank changes; failed loads are not cached.
