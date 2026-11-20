# Inspect visual captures

Use captures to inspect actual rendered pixels without a separate browser tool.
Captures show an initial offline state: live queries, mutations, navigation to
external sites and interactions are unavailable. Review diagnostics before
judging appearance; missing remote resources can change the result.

## Capture a Page

Read `pages.get`, then call `pages.capture` with its `id`, `expectedRevision`,
`locale`, and `options` containing `width`, `height`, `themeMode` (`light` or
`dark`) and `mode` (`viewport`, `full-page` or `element`). Only `element` takes
a `selector`: it must identify exactly one visible DOM element. Prefer an
explicit HTML ID or another unambiguous CSS selector from the Page source.

Captures include drafts under administrator authority. They do not publish,
create routes or make drafts anonymously readable. A changed revision refuses;
read the Page again. A capture bundles the current renderer's local resources,
including the site's theme. Its source revision brackets resource preparation;
it is not a transactional database snapshot or proof of the current live Page.

Widths/heights are 1–4096 CSS pixels. Capture output is limited to 12 million
pixels, 4096 pixels wide, 16384 pixels high and 4 MiB PNG. A very long Page
refuses rather than silently truncating: use a smaller width or capture specific
sections. These captures do not expose a DOM inspection or interaction API.

## Capture a collection example

Use `examples.list` to obtain `exampleId` and `previewId`. Call `examples.capture`
with `collectionId`, those IDs, `locale` and `themeMode`. The selected example
uses its exact declared viewport, its immutable collection defaults and the
installed dependency releases. Site theme customizations and text overrides
are not applied to this demonstration. Capture a composed Page to inspect the
actual site's styling and wording.

## Read and verify the image

Both capture operations return `captureId`, `expiresAt`, source identity,
viewport options, actual image dimensions, browser version, PNG `digest`,
`documentDigest` and bounded diagnostics. `documentDigest` identifies the bundled
document bytes and rendering context; JavaScript timers and other dynamic
behavior mean identical bundles need not produce identical pixels.

Call `captures.image` with `captureId` to receive the PNG as MCP image content.
A metadata response alone does not establish visual verification. If the client
cannot deliver images to its model, explicitly report that visual inspection
was not performed. A download link alone does not prove model access to pixels.

Images expire after five minutes and may be evicted earlier from the bounded
Provider cache. They are private to their instance, administrator and Provider
connection scope. A missing, expired, evicted or foreign capture returns `NOT_FOUND`.
Read authority is checked on every invocation. Captures are not added to Files,
collection releases or public catalogues. Capture again after editing; compare
source revisions rather than assuming an old screenshot is current.

For responsive verification, capture desktop and mobile separately. Correct the
Page, read its new revision and repeat both captures. Report any blocked
resources, JavaScript errors or failed images that limit the conclusion.
