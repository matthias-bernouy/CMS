# First Published Page

This is the target acceptance contract for the first complete authoring
journey, reviewed on 2026-10-25. Implemented controls are listed separately
from verified end-to-end behavior. The completion gate is not yet met.

## Target User Outcome

Starting from an empty installation, one administrator can:

1. start shared services, create a named instance and discover its credentials;
2. sign in to administration;
3. create a Page from a Landing Page starter;
4. change the hero heading and insert a nested text section visually;
5. upload an image to the site media library;
6. select that image, provide alternative text and preview the saved result;
7. configure `/`, search metadata and a native internal navigation link;
8. save and publish the saved content with revision checks;
9. open the public URL and see the expected content, image and link;
10. restart and find the same publication, media and routes.

The administrator must not edit raw HTML, handle a Files namespace key, select
a Provider or install an official dependency manually.

## Target MVP Decisions

- One brochure website and one administrator form the initial product slice.
- Content remains the existing HTML Page document; the editor projects that
  model rather than persisting a second format.
- Blank, Landing Page and Content Page starters are the target. Only blank
  creation is currently exposed.
- Saving is explicit; autosave and collaboration are deferred.
- The outline and accessible move controls are sufficient; drag and drop is
  not required.
- Files credentials stay server-side. Browser controls receive file references
  and previews.
- Preview opens the saved Page URL through normal rendering and authorization.
  Texts and assets are expanded through that renderer. Live local changes may
  update mapped nodes; structural changes need saving and preview reload.
- The iframe uses same-origin script access and is not a JavaScript isolation
  boundary. Editor selection intercepts navigation and submission.
- A local undo stack is available. Durable history is outside this slice.
- Dynamic-data authoring, commerce, external identity providers and high
  availability are outside this initial journey.

## Current Checkpoints

| Checkpoint | Source or test evidence | State |
| --- | --- | --- |
| Startup and credentials | CLI services, named-instance provisioning and credentials commands | Implemented; fresh journey blocked as described below |
| Sign-in and Page creation | Access/content capabilities and smoke journey | Implemented; current container run unverified |
| Blank Page | Empty document without an implicit Bloc | Implemented |
| Landing/Content starters | No exposed starter catalogue | Missing |
| Nested editing | Slot-aware document model, outline, settings and native controls | Implemented; complete browser acceptance pending |
| Media selection | Editor dialog mounts `ulvia-official-file-picker`; native and setting fields consume selections | Implemented; combined upload-to-public-Page journey pending |
| Site compositions | Editor creates and publishes a site Bloc from selected authored content | Implemented; broader product flow pending |
| Undo/redo | Bounded in-memory `EditorHistory`, reset on initialization | Implemented; not persistent history |
| Saved Page preview | Same-origin iframe at the ordinary Page URL | Implemented with structural-refresh limitations |
| Save and publication | Revision-checked capabilities and editor session checks | Implemented; failure journeys need expansion |
| Public rendering and restart | Smoke contains heading publication, route/SEO edits and restart assertions | Authored coverage; no fresh pass in the current audit |

The [smoke journey](../../packages/runtimes/ulvia-cli/tests/stack/kernelSmoke/flows.ts)
also exercises administration, Files and collection upgrades, but its Page
creation path inserts a Heading rather than completing the target hero/media
journey. Domain tests and controls present in source do not replace that gate.

## Verification Blockers

The shared CI setup references a removed prebuild tool. The smoke starts the
unbundled CLI without the now-required initial stack version. Restore these
paths and exercise images built from the candidate commit before claiming a
current container pass. See the [audit](../AUDIT.md#delivery-and-ci).

## Required Failure Behavior

- Preserve local edits after a revision conflict and explain reconciliation.
- Reject invalid documents and incompatible Blocs before save/publication.
- Recover from interrupted or rejected uploads without persisting broken refs.
- Keep draft Pages inaccessible to anonymous visitors.
- Make the saved/published state explicit; unsaved edits must never be
  presented as the public revision.
- Report unresolved required resources before publication.
- Preserve the public result and URL after restart.
- Exercise keyboard focus, narrow viewports and leaving with unsaved changes.

## Completion Gate

One fresh-install browser journey must perform the entire target outcome,
assert the public result, restart and assert it again against the candidate
container/proxy composition. Add focused two-tab, upload-interruption and
rejected-save scenarios.

Use accessible labels and public interfaces. Do not seed Page records through
private persistence or inject Files namespace credentials into the browser.
