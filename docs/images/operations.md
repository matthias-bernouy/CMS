# Responsive Image Operations

## Gateway Activation

The production runtime creates a site-scoped gateway when
`CMS_GATEWAY_SITE_ID` is configured. Its selected provider installation and
file capability must be available before `/.cms/media` and `/.cms/image` can
serve bytes. The runtime uses a local derivative store outside the CMS author
file tree. Provider image processing is currently on demand and bounded to two
concurrent transforms by default.

Every derivative request reauthorizes and rereads the original. A cached
derivative is reused only for the same byte generation and recipe. The local
store prunes records older than seven days and limits retained derivative bytes
to 512 MiB by default. Clear it to regenerate disposable derivatives; retain
the provider's authoritative originals.

CMS File variants use their own store and background generation path. A missing
manifest causes a first render to use the original while variants are queued.

## Checks

For a representative page:

1. Confirm that `src` uses the selected `/.cms/media` capability and that
   `srcset` contains only supported `/.cms/image` widths at or below the
   declared intrinsic width.
2. Confirm that the browser's `currentSrc` suits the rendered CSS width and
   device pixel ratio.
3. Request a derivative as an authorized and unauthorized actor; the latter
   must not receive cached bytes.
4. Check that a changed provider file yields a new derivative generation.
5. Compare cold and warm request latency, failures, and transferred bytes.

The old `CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED` rollout and `cms_source_image`
telemetry still apply to legacy Source image code and benchmarks. They do not
control gateway media routes. Delivery no longer mounts the public Source
image route.
