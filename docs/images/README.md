# Responsive Images

CmsCore uses native responsive-image HTML and bounded server-side derivatives.
The CMS does not choose one fixed image size for every layout. It exposes a
finite set of truthful candidates, then lets the browser select the best one
for the rendered size, device pixel ratio, zoom level, and browser policy.

This documentation covers the platform contract only. It does not describe a
particular site, Bloc implementation, storage provider, or connector.

## Responsibility Model

| Owner | Responsibility |
| --- | --- |
| Original owner | Retain the authoritative original and, for bound Source images, expose its intrinsic width and height. |
| Bloc author | Write semantic `<img>` markup, meaningful `alt`, the loading policy, CSS layout, and optional `sizes` or art direction. |
| Binding runtime | Keep unresolved dynamic URLs network-inert, resolve bindings, and activate complete image attributes safely. |
| Delivery | Detect CMS File references, schedule their jobs, emit candidates, and mount Source image processing. |
| Image features and Sharp | Validate originals, resize and encode bounded WebP derivatives, and use the appropriate derivative store. |
| Browser | Select a candidate from `srcset` using `sizes`, layout, viewport, DPR, zoom, and its own loading policy. |
| Site editor | Choose content and presentation settings; never enumerate derivative widths or operate an encoder. |

The browser owns final candidate selection. CmsCore does not use a
`ResizeObserver` to choose a URL and does not assume that a Bloc always occupies
the same percentage of the viewport.

## Supported Image Paths

CmsCore has two separate optimization pipelines:

| Image URL | Optimization path | When work happens |
| --- | --- | --- |
| Concrete raster `<img src="/.cms/files/by-id/<id>">` rendered by Delivery | CMS Files variants | In a background job after a rendered page first references the file. |
| Bound same-origin `/.cms/sources/...` file URL | CMS Source image derivatives | On demand, after the normal Source request has been resolved and authorized. |
| Other image URL | No responsive derivative pipeline | CmsCore emits no generated candidates for it. |

The two caches and URL contracts are deliberately independent. A CMS File
variant uses `/.cms/img/...`; a Source derivative keeps its Source URL and adds
the reserved `cms-width` parameter.

## End-To-End Flows

For a CMS File:

```text
authoritative CMS file
  -> first page render for an unoptimized content hash uses the original
  -> Delivery queues bounded background variants
  -> the page cache is invalidated
  -> a later render emits srcset
  -> the browser selects one ready WebP
```

For a CMS Source image:

```text
bound URL and intrinsic dimensions resolve
  -> the browser receives a finite srcset
  -> the browser selects one cms-width URL
  -> normal Source resolution and authorization run
  -> the CMS validates the original
  -> the cache retrieves, or Sharp/libvips creates, one WebP derivative
```

## Platform Invariants

- Originals remain authoritative. Responsive derivatives are disposable and
  regenerable.
- V1 transforms by width only, preserves aspect ratio, and never upscales.
- V1 output is WebP at quality 75.
- Candidate URLs come from finite server-owned ladders. Arbitrary dimensions,
  quality, fit, crop, format, and DPR parameters cannot trigger encoding.
- `width` and `height` in markup are intrinsic dimensions. CSS still controls
  the displayed size.
- Dynamic URLs are not exposed to the browser before every network-sensitive
  binding in their image group resolves.
- Authorization is never inferred from possession of a derivative cache key.
- A Source transformation failure never returns the original under a width
  descriptor that promises a derivative.

## Read Next

- [Authoring](./authoring.md) explains the HTML contract, `sizes`, loading,
  dimensions, bindings, and art direction.
- [Delivery pipelines](./delivery.md) records the exact ladders, recipes,
  generation sequence, cache semantics, and current limitations.
- [Operations](./operations.md) covers activation, rollback, failures,
  observability, and cache maintenance.

The normative browser model comes from the
[WHATWG responsive-images specification](https://html.spec.whatwg.org/dev/images.html).
HTTP freshness and validation follow
[RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html).
