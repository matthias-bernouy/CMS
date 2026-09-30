# Authoring Responsive Images

Write standard HTML with a meaningful `alt`, intrinsic `width` and `height`
when known, a suitable loading policy, and CSS for the displayed layout.

```html
<img
  src="/.cms/files/by-id/opaque-file-id"
  width="1600"
  height="1067"
  alt="Description of the image"
  loading="lazy"
  decoding="async"
>
```

Dimensions reserve layout space; CSS still determines displayed size. Use
`loading="lazy"` for below-the-fold images and do not lazy-load a likely Largest
Contentful Paint image.

## Bound Provider Media

Bind an image URL returned by a selected file capability. The URL shape is
`/.cms/media/<contract>/<capability>/<fileId>` on the same origin. Place this
markup below the page shell's existing binding core:

```html
<section cms-source="/.cms/call/catalog/getItem as item" cms-source-method="POST">
  <img
    src="{{ item.image.url }}"
    width="{{ item.image.width }}"
    height="{{ item.image.height }}"
    alt="{{ item.image.alt }}"
    loading="lazy"
    decoding="async"
  >
</section>
```

The binding runtime makes unresolved image URLs inert. The gateway browser
helper recognizes resolved same-origin `/.cms/media` URLs without a query or
fragment and generates `srcset` candidates at declared widths up to the
intrinsic width. It leaves the original media URL in `src`. A URL outside that
shape receives no generated candidates.
This example assumes the query accepts an empty input object; supply the
capability's required fields through `cms-source-body` when necessary.

Use an explicit `sizes` value when the image's layout calls for one, such as
`(min-width: 70rem) 40rem, 100vw`. Otherwise the helper uses `auto, 100vw` for
lazy images and `100vw` for eager images. Authors remain responsible for
art-directed `<picture>` groups and explicit candidates.

Do not write `data-cms-*` attributes in authored content. They are binding
runtime internals. Do not append arbitrary resize parameters or issue provider
requests directly from the browser.
