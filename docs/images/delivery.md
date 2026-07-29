# Responsive Image Delivery Pipelines

CMS Files and CMS Source images share browser standards and WebP output, but
they do not share generation, cache, URL, or authorization semantics.

## Contract Comparison

| Contract | CMS Files | CMS Source images |
| --- | --- | --- |
| Recognized URL | Concrete `/.cms/files/by-id/<id>` | Bound same-origin `/.cms/sources/...` |
| Candidate ladder | 320, 640, 960, 1280, 1920 | 64, 128, 256, 384, 512, 768, 1024, 1280, 1600, 1920, 2560 |
| Generation | Background, after a page render | Eager after declared media mutations; queued fallback on a miss |
| Request-path encoding | Never | Yes, after Source authorization |
| Output | WebP, quality 75 | WebP, quality 75 |
| Upscaling | Never | Never |
| Variant URL | `/.cms/img/<id>/<width>.webp?v=<contentHash>` | Original Source URL plus `cms-width=<width>` |
| Cache | CMS File variant store | Persistent derivatives plus a Mongo media index and queue |
| Original fallback | First render and missing variant | `src`, or the only URL when dimensions are unavailable |

## CMS Files

During page rendering, Delivery finds concrete `/.cms/files/by-id/<id>` URLs,
loads their metadata, and adds the current content hash to `src`. If a raster
manifest already exists, it also emits `srcset`, preserves authored `sizes`, and
fills both intrinsic dimensions when neither was authored.

If the manifest is missing, the response is not blocked:

1. the page is returned with the versioned original;
2. a best-effort in-process job reads the original;
3. Sharp creates the bounded ladder in WebP at quality 75;
4. widths beyond the source collapse to the source's actual width;
5. a manifest is written after the derivatives;
6. the page cache is invalidated;
7. a later render emits the ready candidates.

The worker skips SVG and files without usable raster metadata. Work is
idempotent once a manifest exists, so later jobs for the same content hash are
no-ops. Concurrent cold jobs do not share a single-flight and can duplicate
encoding before either one publishes the manifest.

The variant endpoint never encodes. It only serves an existing derivative. A
syntactically valid missing width between 1 and 4000 receives the original with
revalidation headers only when the stored MIME belongs to its supported raster
fallback set and the original exists; otherwise it returns `404`. In every
case, arbitrary URLs cannot create resize work. Ready production variants are
served for one year with `immutable` because their rendered URLs include the
source content hash.

If one derivative is deleted while its manifest remains, that width continues
to fall back to the original and is not automatically regenerated. Clear the
corresponding manifest or the complete disposable variant store to enqueue a
fresh ladder on a later page render.

Current CMS File variant keys contain the content hash, actual width, and
format. They do not contain an explicit recipe id. If the encoder recipe itself
changes without changing source bytes, the variant store must be cleared so
manifests and derivatives are regenerated.

## CMS Source Images

The browser runtime emits only canonical widths that do not exceed the declared
intrinsic width. The original Source URL remains in `src`; the finite candidate
URLs add `cms-width` with matching `w` descriptors.

V1 accepts exactly one reserved parameter:

```text
cms-width = 64 | 128 | 256 | 384 | 512 | 768 | 1024 |
            1280 | 1600 | 1920 | 2560
```

The name is case-sensitive and the value must be a canonical positive decimal.
Duplicates, unsupported widths, `cms-height`, another `cms-*` parameter, or a
`Range` request return `400`. Without a reserved parameter, the Source request
is an unchanged original passthrough. After validation, `cms-width` is removed
before the upstream endpoint is called.

A Source endpoint is eligible only when it is a `GET`, returns a file, and
declares a supported raster media type. Normal Source resolution and
authorization happen before image processing. The interceptor then:

1. admits the request through a bounded semaphore;
2. executes the authorized upstream request;
3. requires a compatible successful response;
4. reads at most 10 MiB within the read deadline;
5. verifies `Content-Type`, magic bytes, dimensions, and readable image
   metadata;
6. rejects SVG, animation, and inputs above 40 million decoded pixels;
7. applies EXIF orientation and converts to sRGB;
8. resizes by width without enlargement;
9. performs the full pixel decode and encodes WebP at quality 75;
10. stores or reuses the derivative and returns a deterministic ETag.

The immutable recipe identity is `source-responsive-webp-v1`. Its final cache
key also includes the site scope, endpoint contract, relevant request identity,
source digest, effective width, and Sharp/libvips/WebP encoder identity. Any
change to the ladder, format, quality, metadata handling, or animation policy
must receive a new recipe id. When the recipe id or encoder identity changes,
incompatible bytes are not reused.

An integration can declare a versioned `effects.producesMedia` contract on an
upload or replacement endpoint. The bounded response projection supplies the
image identity, revision and dimensions and maps them to a public Source image
endpoint. A successful mutation immediately updates the global media index and
enqueues one job for the image. The worker fetches and inspects the original
once, then emits every bounded width from that same source buffer. Widths above
the intrinsic width share the non-upscaled derivative.

`effects.removesMedia` can resolve an identity from the successful response or
from a declared mutation request parameter. The latter lets a replacement
invalidate the old media generation without widening its public response schema.

Production queue state and the media index are separate Mongo collections.
Jobs are JSON-safe, atomically deduplicated, claimed with renewable leases and
retried with backoff. Critical upload work and cache maintenance have separate
pools. Local enqueues wake a worker immediately; cross-process polling begins at
one second and backs off to five seconds while idle. An opaque-cursor inventory
contract is available for imports and audits, not continuous rescanning.

A public miss is only a repair path. Delivery serves the original with
`private, no-store`, ensures the index/job exists, and performs no decode or
encode in the request. The next request can therefore observe a prepared
variant without a processing-saturation `503`. The in-process scheduler remains
the development default; the production runtime uses the persistent queue.

Remote CMS and worker processes must share a `SourceImageCache` adapter. The
official single-node default stores reconstructible derivatives on local disk
without arbitrary LRU eviction and garbage-collects obsolete generations from
the media index. A deployment can instead supply a shared object-store adapter,
then place regional or global HTTP caches in front of Delivery. Public
derivatives already emit shared immutable headers. Private images stay
synchronous because authorization must be re-evaluated on every request.

## Private And Public Freshness

Private Source images always execute the upstream request before cached
derivative bytes can be reused. This repeats current authorization and source
validation. Their response is `private, no-store`; a derivative cache entry is
never proof of access.

A public Source lookup may bypass the upstream only for an endpoint declared
as a public file whose identity is not computed from the caller. The previous
response must explicitly allow shared caching, vary only on `Accept` and/or
`Accept-Language`, and retain a valid positive freshness lifetime. Upstream
cookies are never exposed. Their presence does not disable caching for this
bounded public flow; every other cookie-bearing response remains private. This
rule does not depend on connector discovery, so a provider configured at runtime
does not require a CMS restart before its public files become cacheable.
`Accept-Encoding` is removed from `Vary` because the proxy has already decoded
the upstream representation and removes its encoding headers.

CmsCore caps public freshness at one year. Public responses use the remaining
`max-age`, `immutable`, `must-revalidate`, and
`Vary: Accept, Accept-Language`.

Every successful Source derivative includes a byte-derived ETag and supports
`If-None-Match`/`304`. Responses also set
`X-Content-Type-Options: nosniff`. These rules follow the cache and validator
model in [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html).

## Current Boundaries

- There is no height resize, crop, fit, quality, format, or DPR query API.
- A bound CMS File URL resolved only in the browser does not pass through the
  server-rendered CMS Files manifest injector.
- Plain static or external URLs receive no CMS-generated candidates.
- Source images narrower than 64 pixels use the original only.
- Automatic Source activation observes the document light DOM. A component
  that owns a bound image inside a Shadow Root must explicitly synchronize each
  image through `syncResponsiveSourceImageElement`.
- Explicit Source `srcset` or `<picture>` candidates disable automatic ladder
  generation for that image group.
