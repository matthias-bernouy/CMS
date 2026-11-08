# Create and publish a page

Creating a draft and publishing it are separate actions. A saved first draft is not evidence that the complete task is finished.

## Establish the requested result

Identify the page's purpose, intended audience, required information, route and publication intent. Ask for missing information when it materially changes the result; otherwise state reasonable assumptions. Do not invent contact details, legal claims or business facts.

## Inspect the site

Use `pages.editor-catalogue` and the installed collection inventory to discover supported Blocs, configuration and examples. Read a relevant existing page to understand the site's conventions. Preserve reusable text references and follow the installed collections rather than inventing unsupported markup.

For a new layout or substantial redesign, follow [Page design](design.md). Keep the content editable and use [rendered design review](design-review.md) to assess the result.

## Create a draft

Use the selected `pages.create` schema. The optional content is bounded HTML, not an arbitrary application bundle. Keep the returned page ID and revision. Resolve any declared refusal before continuing; a Provider may enforce additional validation rules beyond the input schema.

## Verify and improve

Read back the page using `pages.get`. Check its title, route, content and all requested sections. Where browser inspection is available, inspect the rendered result at relevant viewport widths, check for horizontal overflow, missing content and broken interactions, and correct problems before concluding. Saving HTML or passing structural validation does not prove visual quality. If rendering or browser inspection is unavailable, report that limitation rather than claiming the page was visually checked.

Use [the verification guide](verify.md) and [revision guidance](revisions.md). Repeat affected checks after edits. A document describes a process; it is not an executable validation receipt or a server-enforced publication gate.

## Publish and confirm

If publication is part of the user's request, call `pages.publish` with the current values required by the selected schema. Read back state and, where available, check the public URL. Report the delivered result, checks performed and any remaining limitations. Do not treat a returned HTTP success as proof that every requested quality criterion was satisfied.
