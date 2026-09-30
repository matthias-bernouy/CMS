# Responsive Image Delivery

## CMS Files

Delivery recognizes concrete `/.cms/files/by-id/<id>` references while
rendering a page. It adds a content hash to the original URL and, when a
variant manifest exists, emits a bounded `srcset`. Missing variants do not
block the page: a background job creates WebP candidates at 320, 640, 960,
1280, and 1920 pixels, then invalidates the page cache.

The variant endpoint serves existing bytes and never encodes during the
request. Its URLs use `/.cms/img/<id>/<width>.webp?v=<contentHash>`.

## Provider Media

A selected file capability is served at
`/.cms/media/<contract>/<capability>/<fileId>`. Its WebP derivatives use
`/.cms/image/<contract>/<capability>/<fileId>/<width>.webp`. The supported
widths are 64, 128, 256, 384, 512, 768, 1024, 1280, 1600, 1920, and 2560.
The browser helper emits only widths at or below the declared intrinsic width.
The gateway never upscales.

Each media or image request resolves the exact site selection and current
installation, checks the actor grant, and reads the original through the
provider capability. For an image, the gateway validates the provider's media
identity and source bytes before looking up a derivative keyed by byte
generation and recipe. On a miss it inspects and encodes the image within
bounded concurrency, input, pixel, time, and output limits. The recipe emits
WebP at quality 75. The local derivative store is disposable.

Responses currently use `private, no-store`, including public capabilities.
This does not disable the gateway's derivative store. A cache hit reuses encoded
bytes after a fresh authorized original read; it is not a client or CDN cache hit.
The gateway has no durable derivative queue or public shared-cache policy.
Local store garbage collection is limited to age and size pruning. A
processing miss may add request latency or return a capacity error. These are
remaining migration tasks.

The old Source `cms-width` URL contract is no longer mounted by Delivery.

Both author files and gateway media use `@bernouy/image-processing/sharp` for
generic transforms. Their recipes, queues, authorization and storage are owned
by their respective feature domains.
