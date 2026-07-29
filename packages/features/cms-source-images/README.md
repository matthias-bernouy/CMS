# CMS Source images

`@bernouy/cms-source-images` creates bounded WebP derivatives for authorized CMS
Source image responses. Originals remain owned by the upstream connector. The
browser can request only the finite widths exported as
`SOURCE_IMAGE_WIDTHS`; arbitrary transform parameters never trigger work.

## Browser rollout contract

The host supplies two independent markup switches to
`createResponsiveSourceImageBrowserApi`:

- `public` enables explicitly public consumers;
- `private` enables every other consumer.

Public classification is opt-in. An image joins the public cohort only when it
has `data-source-image-access="public"`. A missing, misspelled, or unknown value
is classified as private.

Both intrinsic dimensions must resolve to positive integers before responsive
markup is emitted. A pair rendered as empty strings by the binding runtime is a
historical row with unknown dimensions and receives the immutable original.
Partial, invalid, or still-unresolved bindings remain network-dark.

The official runtime enables the server-side transformer and both markup
cohorts when their configuration is omitted. Only an explicit `false` disables
a capability. The transformer remains the prerequisite: disabling it also
forces both markup cohorts off. During rollback, disable private markup, then
public markup, and finally the transformer after previously loaded bundles have
drained.

## Processing topology

An integration mutation can declare `effects.producesMedia`. A successful
response binds its scalar image identity, optional revision and dimensions to a
public `GET` file/image endpoint. CmsCore immediately upserts a canonical media
entry and enqueues one critical job. That job fetches and inspects the original
once, then prepares every recipe width without enlargement. Removal effects
can bind the old identity from the successful response or a declared mutation
request parameter; they invalidate the index and allow explicit garbage collection. An optional
`mediaInventory` contract uses opaque cursor pagination for historical imports
and audits; normal operation never rescans the catalogue.

Production uses a Mongo queue and a separate Mongo media index. Enqueue and
claim are atomic, claims have renewable leases, retries use bounded backoff, and
critical/media-cache pools are independent. A local enqueue wakes a worker
immediately. Remote work is discovered every second, with idle polling backing
off to five seconds with jitter. Jobs survive restarts and stale generations
cannot publish once a replacement has updated the index.

A public cold miss remains a safety net. Delivery returns the original
immediately and atomically ensures the media job exists; it never performs the
heavy encode in the HTTP path and does not return a processing-saturation 503.
The in-process scheduler remains available for development and tests.

`SourceImageCache`, `SourceImageJobQueue`, and `SourceMediaIndex` are adapter
boundaries. The official single-node runtime uses the local filesystem in
persistent-retention mode for reconstructible derivatives and Mongo for queue
state. External workers or multiple regions must share a cache/object-store
adapter; regional or global HTTP caches can then sit in front of Delivery.
Private Source images remain inline because authorization must be repeated for
every request.
