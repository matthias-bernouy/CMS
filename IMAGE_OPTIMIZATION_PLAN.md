# Source Image Optimization

Status: implementation contract

Date: 2026-07-24

Scope: generic CMS Source image responses, with Commerce 1.0.0 as the first
complete consumer.

## Decision

Supabase keeps the immutable original and remains its source of truth. Supabase
does not store responsive variants and its Edge Functions never load Sharp or
encode images.

The CMS recognizes an eligible Source `GET` endpoint declared with
`responseKind: "file"` and a raster `image/*` media type. When the browser asks
for the reserved `cms-width` query parameter, the CMS authorizes the normal
Source request, validates the returned original, creates one canonical WebP on
demand, and stores it in a disposable CMS cache.

```text
private Supabase original
  -> normal Source resolution and authorization
  -> bounded CMS image interceptor
  -> disposable derivative cache
  -> one canonical WebP response
```

Responsive candidate selection stays in the browser:

- the CMS owns the finite recipe and builds truthful `srcset` candidates;
- the consuming Bloc owns `sizes`, because it knows its layout;
- the browser combines `srcset`, `sizes`, viewport, layout, and DPR;
- the CMS generates only the canonical URL selected by the browser.

There are no Commerce rendition tables, manifests, variant objects, jobs,
workers, outboxes, cleanup jobs, or migration ledgers.

## V1 URL and recipe contract

V1 accepts only `cms-width`. All `cms-*` names are reserved and a Source may not
declare them as business parameters. Reserved parameters are consumed by the CMS
and never forwarded to Supabase.

The only accepted widths are:

```text
64, 128, 256, 384, 512, 768, 1024, 1280, 1600, 1920, 2560
```

An unsupported, duplicate, or non-canonical width is a stable client error and
must not create a cache object. V1 has no arbitrary height, crop, fit, quality,
format, or DPR parameter. Future crops require finite named presets.

The immutable recipe is `source-responsive-webp-v1`:

- WebP quality 75;
- EXIF orientation applied;
- sRGB output;
- non-essential metadata removed;
- aspect ratio preserved;
- no upscale;
- encoded input limit of 10 MiB;
- `limitInputPixels` of 40,000,000 at Sharp construction;
- SVG and animated input rejected;
- bounded read and processing deadlines.

Changing the ladder, format, quality, metadata policy, animation policy, or
encoder identity requires a new recipe identity.

## Eligibility and byte validation

A transform runs only when all conditions hold:

- the resolved endpoint method is `GET`;
- `responseKind` is `file`;
- declared media is a supported raster type or `image/*`;
- valid `cms-width` is present;
- no incompatible `Range` header is present;
- Source resolution and authorization already succeeded.

Without `cms-width`, behavior is the existing Source passthrough.

Before Sharp receives bytes, the interceptor verifies:

- the upstream status remains compatible with the endpoint contract;
- the actual `Content-Type` is a supported raster media type;
- magic bytes agree with the actual format;
- the body stays below the encoded-byte bound while being read;
- the decoder accepts the image;
- dimensions are positive and within the pixel bound;
- the input is neither SVG nor animated.

Errors returned by the upstream remain upstream errors. Invalid successful image
payloads fail safely and never poison the cache.

## Cache contract

Derivatives are runtime infrastructure, not Commerce data. The cache is
injected, bounded, disposable, and fully regenerable from Supabase originals.
Deleting it has no functional consequence.

A final derivative identity covers at least:

- deployment/site scope;
- resolved endpoint identity and method;
- normalized request identity relevant to the original;
- source digest or equivalent immutable identity;
- recipe identity;
- effective output width;
- encoder identity.

The runtime implementation provides:

- a bounded memory implementation for tests and embedders;
- an opaque-key local filesystem cache for production;
- atomic metadata-last publication;
- integrity verification before serving persisted bytes;
- bounded entries, bytes, age, and maintenance;
- local single-flight per canonical identity;
- pre-upstream coalescing for identical eligible public cold misses;
- a global Sharp semaphore initialized to one encode;
- removal of failed single-flight entries so requests can retry;
- deterministic ETags from output bytes;
- `If-None-Match` / `304` after required authorization;
- `X-Content-Type-Options: nosniff`;
- no stale source `Content-Length` or `Content-Encoding`.

No SQL lock or distributed lease is introduced. Rare duplicate work across CMS
instances is acceptable while writes stay deterministic and partial results are
invisible.

## Authorization and HTTP freshness

Source authorization and Commerce object authorization are separate boundaries.

For a private seller, admin, or authenticated endpoint, every request still
calls the upstream before cached bytes can be served. This re-executes Commerce
object authorization. Private derivative bytes may be internally deduplicated,
but the response stays private and the cache never grants access.

For a public image, a local lookup may bypass the upstream only while:

- the previous upstream response explicitly allowed shared caching;
- its remaining lifetime, including `Age`, is positive;
- the CMS cap is no longer than the upstream lifetime;
- all upstream `Vary` dimensions are represented in the lookup identity;
- the source identity is not computed per caller.

Commerce keeps its current one-hour public revocation window. The CMS never
turns that response into a one-year immutable authorization promise.

## Responsive primitive

The generic browser primitive receives:

```ts
type ResponsiveSourceImageInput = {
    baseUrl: string;
    sourceWidth: number;
    sourceHeight: number;
    loading: "lazy" | "eager";
    authoredSizes?: string;
};
```

It produces:

- the immutable original URL as a safe `src` fallback;
- a `srcset` containing only recipe rungs not exceeding intrinsic width;
- a descriptor equal to the natural width returned by that URL;
- intrinsic `width` and `height`;
- preserved explicit `sizes`;
- `sizes="auto, 100vw"` for lazy images without authored sizes;
- `sizes="100vw"` for eager images without authored sizes.

The original is not inserted as a non-recipe `srcset` candidate. This keeps all
candidate URLs finite while retaining a functional fallback for historical
records and old browsers. Images narrower than the first rung remain original
only.

Client-bound attributes activate only when base URL and intrinsic dimensions are
resolved. Values that are empty or still contain `{{` issue no request. The
activation order is:

1. `width` and `height`;
2. `sizes`;
3. `srcset`;
4. `src`.

Generated attributes are ownership-marked so recycled DOM nodes can be cleaned
without overwriting authored attributes.

This works for the same Bloc in a roughly 30vw card and a 100vw layout.
Supporting browsers use lazy auto-sizes; other browsers use the conservative
100vw fallback.

## Commerce 1.0.0 media contract

Commerce is changed directly in `versions/1.0.0`. No second integration version
is created.

### Upload boundary

Product and offer uploads:

- authorize the target and any replaced media before parsing file bytes;
- use `Content-Length` only as a fast rejection;
- enforce the real limit through a bounded multipart stream;
- cancel the request body on overflow;
- accept exactly one file;
- detect real JPEG, PNG, WebP, GIF, or AVIF type and dimensions;
- never trust the uploaded extension or multipart MIME;
- allocate a new immutable media identity and Storage path;
- upload with the detected MIME;
- call an authoritative attach-v2 RPC after upload;
- delete only the just-uploaded object if that attach recheck fails.

An authorization refusal performs zero file-byte reads and zero Storage calls.

### Persistence and lifecycle

Media metadata gains nullable intrinsic width and height for historical rows and
a nullable detached timestamp. New uploads persist detected values.

Original identity and Storage path are immutable. Replacement creates a new
media row and object, swaps the business link immediately, and detaches the old
row. Removal unlinks and detaches. Neither operation deletes the old Storage
object or metadata.

Public, seller, admin, offer, and product download contexts treat detached media
as not found.

SQL remains additive and replayable:

- a fresh installation succeeds;
- an existing physical 1.0.0 schema with data upgrades safely;
- historical dimensions may remain null until a trusted one-time backfill;
- applying the same bundle a second time succeeds;
- legacy attach signatures remain callable during SQL-before-Edge rollout;
- new remove/replace responses omit retained Storage coordinates so an old Edge
Function cannot delete originals.

Existing installations require a forced reconciliation/rerun of Commerce 1.0.0
to apply the updated bundle.

## Observability

The interceptor reports a closed, privacy-safe metric contract:

- eligible requests and passthrough reason;
- canonical width;
- hit, miss, stale, eviction, and joined single-flight;
- semaphore wait;
- upstream, read, metadata/decode inspection, encode, and store timing;
- source and output byte counts and compression ratio;
- failures and fallbacks.

The payload never includes URL, endpoint ID, Storage path, filename, media ID,
offer ID, product ID, seller/user ID, authorization header, or secret.

The runtime samples routine image observations using the existing Source timing
sample rate. Rejections, evictions, failures, and fallbacks are always reported.
Image stages extend the existing endpoint-performance model without a general
analytics dashboard rewrite.

Sharp/libvips decodes pixels lazily. The decode stage measures metadata and
decodability inspection; the encode stage measures the complete pixel decode,
orientation, resize, color conversion, and WebP pipeline.

## Verification and activation gates

Focused tests cover Source eligibility, reserved parameters, response validation,
every recipe rung, limits, corruption, concurrency, cache identity and
freshness, private authorization, upload lifecycle, detached access, SQL
compatibility, responsive ownership, and cleanup.

A real Chromium test covers:

- the same image in 30% and 100% containers;
- DPR 1 and DPR 2;
- auto-sizes and conservative fallback;
- `currentSrc` and actual network requests;
- no original-plus-variant double request;
- no material CLS.

The reproducible benchmark compares the original adapter and the real Source
image interceptor with identical configuration:

- representative read-only Commerce corpus outside the repository;
- 12-card grid;
- cold and warm phases;
- narrow and wide layouts;
- DPR 1 and 2;
- one and four concurrent users;
- concurrent normal Source/API traffic;
- bytes, original reads, encodes, image timing, CPU, RSS, p50/p95/p99, CLS, and
  errors.

Activation requires:

- median and p95 image-byte savings of at least 80%;
- zero warm encode and zero warm original read;
- correct single-flight and descriptors;
- no authorization bypass;
- no significant aggregate foreground p95 regression;
- an explicit absolute cold foreground budget;
- no image errors or material CLS regression;
- tested rollback to original Source URLs.

The benchmark records p50, p95, and p99. The foreground release gate compares
aggregate p95 with a small absolute noise allowance; it does not hide cold CPU or
memory cost, which remains reported separately.

## Rollout and rollback

Activation order:

1. deploy additive Commerce SQL;
2. deploy compatible Commerce Edge code;
3. deploy the CMS interceptor and cache dark-capable;
4. enable responsive markup on the public 12-card listing;
5. observe cache, failure, CPU, memory, and foreground latency;
6. enable private responsive consumers after upstream reauthorization is proven.

Rollback is immediate and non-destructive: remove `cms-width` candidates or
disable the interceptor so existing original Source URLs pass through unchanged.
Supabase originals were never migrated or deleted. The CMS derivative directory
can be cleared at any time.

## Explicitly deferred

- arbitrary transform parameters;
- AVIF output;
- animated images and SVG;
- distributed encoding locks;
- SQL leases or image workers;
- Supabase renditions or cleanup;
- original deletion or retention expiry;
- automatic historical dimension inference in production;
- a new Commerce integration version;
- generalized `@bernouy/cms-files` refactoring;
- complex authorize-only/HEAD endpoints.
