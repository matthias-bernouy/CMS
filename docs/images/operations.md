# Responsive Image Operations

## Production Activation

CMS Source transforms and browser markup are separate rollout gates. All three
server variables default to `false`:

```text
CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED
CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED
CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED
```

Enable them in this order:

1. enable server transforms and verify cache availability;
2. enable public responsive markup and observe generation and delivery;
3. enable private responsive markup only after repeated upstream authorization
   has been verified.

The browser switches are effective only while the interceptor is installed.
For rollback, disable private markup, then public markup. Keep transforms
enabled while already loaded pages and cached runtime bundles drain, then
disable transforms. A residual `cms-width` request received after transforms
are disabled returns `503`; CmsCore never serves an original under a false width
descriptor.

`p9r dev` and `p9r preview` enable public and private Source images by default.
Use `--no-source-images` to exercise the original-only path.

CMS File optimization has no rollout flag. It is available when Delivery is
configured with file metadata, the original blob store, and a variant store.
Its first-render fallback means pages remain functional while variants are
missing or regenerating.

## Cache Maintenance

Both derivative stores are disposable. Clearing one removes performance data,
not authoritative media. The next eligible request or page render regenerates
what is needed.

Do not combine the stores operationally:

- CMS File variants back `/.cms/img/...` and are keyed by file content hash;
- Source image derivatives and public lookups live in the dedicated Source
  image cache and use opaque identities.

The default production Source image cache is local and bounded to 512 MiB,
10,000 derivatives, and 20,000 lookup records. Its configured derivative age is
seven days, enforced when the cache initializes and when entries are read,
rather than by a periodic sweep. Public authorization freshness remains capped
at one hour even if a lookup file is retained longer.

For the Source image cache, a cache read or write failure is treated as a miss
or an unstored generated response where safe. Partial files are not published,
and persisted derivatives are checked by size and SHA-256 before service. This
fail-open cache guarantee does not apply generally to CMS File variant-store
read failures.

## HTTP Failures

| Status | Meaning |
| --- | --- |
| `400` | Invalid or unsupported CMS parameter, ineligible endpoint, or incompatible `Range`. |
| `502` | A nominally successful upstream response was not a valid bounded image, or processing failed. |
| `503` | Transforms are disabled or the processing semaphore is saturated. The response includes `Retry-After: 1`. |
| Upstream status | A non-success response from the authorized Source is propagated. |
| `200` / `304` | WebP derivative or successful ETag revalidation. |

CMS-generated `502` and `503` responses use `no-store`. Parameter-validation
`400` responses do not currently add an explicit cache directive, while an
upstream failure is propagated with its upstream headers. The Source path fails
closed instead of returning an original under a URL whose `w` descriptor
promises a smaller representation. The separate original `src` remains the
semantic fallback in the markup.

## Observability

The server emits structured `cms_source_image` events. Routine successes are
sampled with `SOURCE_TIMING_SAMPLE_RATE`, whose default is `0.01`. Rejections,
upstream errors, processing failures, evictions, and cache errors are always
reported.

The event can include:

- public or private policy;
- requested canonical width;
- hit, miss, or stale cache state;
- joined single-flight, eviction, and cache error counts;
- upstream, semaphore wait, read, decode, encode, and store durations;
- source bytes, output bytes, and compression ratio;
- a closed outcome and failure reason.

The image event contract contains no URL, filename, endpoint identifier, media
identifier, user identifier, authorization header, cookie, or secret.

The stage named `decode` measures metadata inspection and decoder acceptance.
The complete pixel decode, orientation, color conversion, resize, and WebP
encoding occur during the `encode` stage.

## Operational Checks

For a representative page, verify both cold and warm behavior:

1. inspect the rendered `<img>` for truthful `width`, `height`, `sizes`, and
   `srcset`;
2. confirm `currentSrc` is a candidate appropriate to the rendered CSS width and
   DPR;
3. confirm every `w` descriptor matches the `cms-width` URL value or CMS File
   variant width;
4. for a ready derivative, confirm the response is WebP and its decoded width
   is no larger than advertised; treat a revalidating original from
   `/.cms/img/...` as a missing CMS File variant rather than a successful
   derivative;
5. verify private Source requests still reach upstream authorization;
6. verify a warm request performs no encode;
7. compare transferred bytes, failures, semaphore wait, encode time, and cache
   state rather than relying only on page load time;
8. test narrow and full-width placements, DPR 1 and 2, cold and warm caches, and
   the disabled/original-only path.

Browser selection is intentionally user-agent controlled. A test should assert
that the selected candidate is valid and appropriately bounded, not require one
exact candidate across every browser and network condition.
