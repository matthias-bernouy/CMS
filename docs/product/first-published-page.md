# First Published Page

This document is the product acceptance contract for the first complete CmsCore
authoring journey. It deliberately targets a single-site brochure website. The
journey is complete only when an administrator can create and publish a useful
page without editing HTML or handling provider credentials.

## User Outcome

Starting from an empty local data directory, one administrator can:

1. start CmsCore and discover the Control URL and credentials;
2. sign in to Control;
3. create an `Accueil` Delivery Page from the official Landing Page starter;
4. change the hero heading and add a text section visually;
5. upload an image to the site's media library;
6. select the image, provide alternative text and preview the result;
7. configure `/` and the Page's search metadata;
8. save a draft and publish that exact revision;
9. open Delivery and see the published text and image;
10. restart CmsCore and find the same draft, publication and media state.

The administrator must not edit the Page document as raw HTML, provide a Files
namespace key, select a provider or install a required official dependency.

## Locked MVP Decisions

- The first product slice serves one brochure website and one administrator.
- Page content remains the existing HTML `PageDocument`; the editor is a safe
  structured projection over it, not a second persistence format.
- Page creation offers `Blank`, `Landing Page` and `Content Page` starters.
- Saving is explicit. Autosave and collaborative editing are deferred.
- The editor uses an outline and accessible move controls. Drag and drop is not
  required for this journey.
- An advanced raw-document escape hatch may remain, but it is not the primary
  path and is not used by the acceptance journey.
- Site media credentials remain server-side. Control receives File references,
  upload progress and previews, never a namespace key.
- Publication targets the last saved revision. Unsaved changes cannot be
  presented as published.
- Public site media is the only media visibility needed by this slice.
- Forms, commerce, third-party collection JavaScript, version history, OIDC,
  provider-managed instance lifecycle and high availability are out of scope.

## Acceptance Checkpoints

| Checkpoint | Current evidence | State |
| --- | --- | --- |
| Fresh local startup and credential discovery | `ulvia dev` and `ulvia dev credentials` | Implemented |
| Administrator sign-in | Control browser smoke | Implemented |
| Delivery Page creation | `ulvia.cms.pages/create` through Control | Implemented |
| Blank Page creation | New Pages start with an empty document and no implicit Bloc | Implemented |
| Landing/Content starter selection | No authored starter catalogue is exposed yet | Missing |
| Visual Bloc insertion and editing | Page editor catalogue, outline, settings, move/duplicate/remove controls and browser smoke | Implemented for top-level Blocs |
| Site media library and picker | Files provider exists; no site-bound Control workflow exists | Missing |
| Isolated document preview | Current document preview Bloc | Partial |
| Revision-checked save and publication | Page update and publish capabilities | Implemented |
| Public Delivery rendering | Browser smoke publishes and opens `/smoke-page` | Implemented |
| Restart persistence | Browser smoke repeats Control and Delivery reads after restart | Implemented |

The existing smoke establishes the executable lower bound: it creates a blank
document, adds and edits a managed Heading through the visual editor, publishes
it, verifies Delivery and repeats the public read after restart. It must add
starter and nested-slot selection next, then add the media journey.

## Required Failure Behaviour

- A revision conflict preserves the local document and asks the administrator
  to reload or reconcile; it never silently overwrites a newer revision.
- An invalid document or incompatible Bloc cannot be saved or published.
- A rejected or interrupted upload stays recoverable in the editor and cannot
  produce a broken File reference.
- A draft Page is not publicly reachable.
- Publishing is blocked while the editor contains unsaved changes.
- A missing public asset is reported before publication.
- Restarting services cannot change the published revision or public URL.

## Completion Gate

The slice is complete when one opt-in browser test performs the entire user
outcome against a fresh data directory, asserts the public Delivery result,
restarts the stack and asserts it again. The same journey must pass against the
production container and proxy composition before a product release.

The test may use stable accessible labels and public URLs. It must not call
private persistence APIs, seed page records directly or inject Files namespace
credentials into the browser.
