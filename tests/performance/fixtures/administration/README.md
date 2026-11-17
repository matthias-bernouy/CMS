# Pinned Administration Regression Fixture

`mossa-1.18.0.json.gz` is immutable test evidence captured on 2026-11-17 from
the public release and asset endpoints of `https://repo.ulvia.fr`. It contains
the complete compiled `ulvia/mossa@1.18.0` release and its 58 base64 assets,
compressed as JSON with deterministic gzip metadata. No site data or credentials
are included. This versioned fixture is deliberate regression input, not build
output or a bundled production collection.

- Release digest: `sha256:c9e14a512f09aa4f680ff4447cb5253040533d9e17c3756738696089535de41a`.
- Compressed file SHA-256: `c39db5939104b95b4503c50a68317379a588d2a8d596c1e30bf56b7abbc1a735`.
- 107 blocs, 117 examples, 712 texts, 51 states, 21 administration Pages.
- 58 assets totaling 1,116,374 bytes. The compressed fixture is 1,353,039 bytes.

Tests verify the release's canonical digest and every asset's size and digest.
They never fetch current production content. Historical restoration uses the
real `LocalCollectionRepository.store()` in a test-owned container, outside
measurement, followed by a Provider restart to clear catalogue caches. This
does not test editable-source publication: the captured published bundle has
no private authoring source snapshot. Measured plans use the ordinary Registry
HTTP catalogue, release and asset endpoints and the actual initialization path.

The original artifact remains unchanged. A clearly distinct prerelease,
`1.19.0-performance.0`, adds controls proposing 0, 1 or 21 static Pages while
retaining all original blocs, examples and assets. These controls isolate full
library admission from real administration Page validation; they are not smaller
versions of Mossa and do not execute dynamic business queries. The exact original
recipe retains its real query/mutation bindings, SVG references and login role.

Restoration fails if the container does not contain exactly one Registry. No
initialization plan is applied, and no production endpoint is load-tested.
