# Responsive Images

CmsCore uses native responsive-image HTML and bounded WebP derivatives. The
browser selects a candidate from `srcset` using image layout, `sizes`, device
pixel ratio, and its own loading policy.

## Supported Paths

| Image URL | Optimization | Generation |
| --- | --- | --- |
| `/.cms/files/by-id/<id>` rendered by Delivery | CMS Files variants at `/.cms/img/...` | Background job after a page first references the file. |
| Selected provider file at `/.cms/media/<contract>/<capability>/<fileId>` | Gateway derivatives at `/.cms/image/<contract>/<capability>/<fileId>/<width>.webp` | Bounded on-demand processing after a fresh authorized file read. |
| Other URL | None | No generated candidates. |

The original remains authoritative. Derivatives are disposable and never grant
access to the original. Gateway requests recheck the selected contract,
installation, actor grant, and original file before a derivative cache lookup.
Gateway derivative responses currently use `private, no-store`; durable jobs and
public cache policy have not been added yet.

The old `/.cms/sources` image route and Source image worker have been removed.
Provider media uses selected gateway capabilities.

## Responsibilities

- The provider retains the original and supplies intrinsic width and height.
- Bloc authors write semantic `<img>` markup, `alt`, layout CSS, loading policy,
  and optional `sizes` or art direction.
- The binding runtime keeps unresolved URLs inert until interpolation finishes.
- The gateway browser helper generates bounded candidates for same-origin
  `/.cms/media` URLs with known dimensions.
- The browser chooses the candidate. CmsCore does not measure the rendered
  element to select a width.

See [authoring](./authoring.md), [delivery](./delivery.md), and
[operations](./operations.md) for the current contracts.
