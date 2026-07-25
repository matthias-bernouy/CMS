# Authoring Responsive Images

Bloc authors write standard HTML. Attributes prefixed with `data-cms-` are
runtime internals and are not an authoring API.

## Baseline Markup

Every content image needs:

- a usable `src` or bound Source URL;
- an `alt` value appropriate to the image's meaning;
- both intrinsic `width` and `height` when they are known;
- a loading policy appropriate to its position;
- CSS that defines its displayed layout.

For a concrete CMS File URL:

```html
<img
  class="content-image"
  src="/.cms/files/by-id/opaque-file-id"
  width="1600"
  height="1067"
  alt="Description of the image"
  loading="lazy"
  decoding="async"
>
```

Typical responsive CSS remains ordinary CSS:

```css
.content-image {
  display: block;
  width: 100%;
  height: auto;
}
```

The HTML dimensions describe the source aspect ratio; they do not force the
image to render at that many CSS pixels. Supplying both lets the browser reserve
space before the bytes arrive and reduces layout shift.

## Bound Source Images

Keep bound image markup canonical inside `<cms-binding-core>`:

```html
<cms-binding-core>
  <section cms-source="/.cms/sources/content/item?id=42">
    <img
      src="/.cms/sources/content/image?id={{ image.id }}"
      width="{{ image.width }}"
      height="{{ image.height }}"
      alt="{{ image.alt }}"
      loading="lazy"
      decoding="async"
    >
  </section>
</cms-binding-core>
```

Before the live DOM can issue a request, the binding layer temporarily makes
dynamic `src`, `srcset`, `sizes`, `media`, `width`, and `height` inert. If one
member of a `<picture>` is dynamic, the complete group is inert. Once every
value resolves, the image runtime activates attributes in this order:

1. `width`;
2. `height`;
3. `sizes`;
4. `srcset`;
5. `src`.

An unresolved URL, partial dimensions, invalid dimensions, or unresolved
`sizes` leaves `src` and `srcset` absent, so no speculative request escapes.
Saved content is restored to standard HTML; internal attributes and generated
candidates are not persisted.

Automatic Source candidates require:

- a same-origin URL whose path contains `/.cms/sources/`;
- positive integer intrinsic width and height;
- no explicit `srcset` for the image group;
- the matching public or private runtime cohort to be enabled.

`data-source-image-access="public"` opts markup into the public rollout cohort.
An absent, misspelled, or unknown value is private. This marker never grants
access: the resolved Source endpoint contract remains the server-side authority.

Historical data whose runtime dimensions are both genuinely absent or `null`
receives the original only. The low-level compatibility path also accepts an
empty pair from legacy `data-source-width` and `data-source-height` attributes.
Empty canonical `width`/`height` bindings are still unresolved and remain
network-inert. A partial or invalid pair also stays inert because guessing a
ratio or candidate width could cause both incorrect layout and unintended
requests.

## `sizes` Ownership

The Bloc author owns layout; the browser owns selection. Authors do not list
candidate URLs or CMS width rungs.

An explicit standard `sizes` value is preserved exactly:

```html
<img
  src="{{ image.url }}"
  width="{{ image.width }}"
  height="{{ image.height }}"
  sizes="(min-width: 70rem) 40rem, 100vw"
  alt="{{ image.alt }}"
  loading="eager"
>
```

When `sizes` is omitted, CmsCore uses:

- `auto, 100vw` for exactly `loading="lazy"`;
- `100vw` for eager images and for images without `loading="lazy"`.

For lazy images, standards-compliant auto-sizes lets the browser use the
concrete rendered width; `100vw` is the conservative fallback. This handles the
same Bloc in a narrow card and a full-width region without JavaScript layout
measurement. For an eager image in a narrow fixed layout, provide an accurate
`sizes`; the `100vw` default is safe but can download a larger candidate.

## Loading Priority

- Use `loading="lazy"` for images that are normally below the fold.
- Do not lazy-load the likely Largest Contentful Paint image.
- Use eager loading, and optionally `fetchpriority="high"`, only for a
  deliberately prioritized image.
- `decoding="async"` is a reasonable default for non-critical content images.

CmsCore does not rewrite `loading`, `decoding`, or `fetchpriority`.

## Explicit `srcset` And `<picture>`

Use a standard explicit `srcset` or `<picture>` only for a contract the generic
width ladder cannot express, such as art direction with different crops. When
explicit candidates are present, the Source image runtime preserves the group
and does not generate another ladder.

CmsCore does not create crops, infer focal points, or convert media conditions
into variants. An explicit group remains the Bloc author's responsibility.

## Do Not

- Do not write `data-cms-src`, `data-cms-width`, or other internal activation
  attributes in authored content.
- Do not append arbitrary `cms-width` or `cms-height` parameters.
- Do not omit one intrinsic dimension while binding the other.
- Do not use `width` and `height` as substitutes for CSS layout.
- Do not build a custom fetch-and-Blob image loader for ordinary content.
- Do not expect plain external or static asset URLs to be transformed by the
  CMS.

See the [WHATWG image candidate model](https://html.spec.whatwg.org/dev/images.html)
for the normative behavior of `srcset`, width descriptors, `sizes`, and
auto-sizes.
