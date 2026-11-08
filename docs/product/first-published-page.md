# First Published Page

Fresh instances provide system APIs, an administrator and native setup at
`/.cms/setup`. They contain no collections, Pages or visual administration editor.
This guide describes the implemented publication path, not a shipped visual
editing journey.

## Current Development Flow

1. Start shared services, create a named instance and retrieve its credentials
   through the CLI. See [installation](../installation/README.md).
2. Open `/.cms/setup`, authenticate and complete an empty site, or explicitly
   review a recipe from a published collection. Setup is separate from provisioning.
3. Publish and install a collection through the Repository and Installations APIs
   or CLI. Installed Blocs provide the roots, slots and settings for Page content.
4. Use Content capabilities to create and edit a Page with its current revision.
   A blank document is valid; nonempty content must satisfy Bloc/document admission.
   Native elements belong inside declared roots and slots.
5. Set paths, metadata and publication through Content capabilities. Draft Pages
   remain unavailable to anonymous readers.
6. Open the public URL. Content renders the stored Page; Edge forwards the
   resource and applies final HTTP security and cache policy.
7. Restart and verify the same Page, installed collection and publication.

Files upload, signatures and representations are available through the selected
Files contract. A client may place their references in admitted Page content;
there is no bundled visual media picker or Page editor.

## Executable Evidence

The [CLI smoke flow](../../packages/runtimes/ulvia-cli/tests/stack/edgeSmoke/flows.ts)
completes empty native setup, verifies zero initial Pages and collections,
explicitly publishes and installs a small test collection, creates a draft Page,
publishes it and checks the browser result. It also checks refused writes,
instance separation, persistence after restart and HTTP 410 after deletion.
It does not certify a visual editing or upload-to-Page browser journey.

The [instance integration harness](../../tests/integration/instance/README.md)
contains separate API, media, MCP and delivery journeys. These tests require
matching local images and explicit activation; ordinary unit verification does
not establish their execution.

Run `bun run test:edge-smoke` for the fresh local browser journey or
`bun run verify:full` to include static, unit and delivery performance checks.
See [development](../development/README.md#checks-and-build) for prerequisites.

## Visual Authoring Boundary

A visual client can project the existing Page document, use revision-checked
capabilities and preview the saved Page at its ordinary URL. Starters, nested
editing controls, media selection, undo/redo and conflict reconciliation need
an authored client. They are not implied by the underlying domain APIs.
A complete editorial acceptance journey would need to demonstrate editing,
upload and selection, publication and restart through that client. No bundled
client currently establishes that outcome.
