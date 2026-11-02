# First documentation application trial

Observed on 2026-11-02 against private native MongoDB, Repository, Provider and
Edge processes, with real browser OAuth and Chrome. No public publication was
performed. Each participant started with fresh context and no model override.
The exact inherited model identifier is not exposed by the collaboration tool.

## Before and after

The baseline and improved collection missions had the same objective: publish
and install `agent-authoring/agent-kit@1.0.0` with a panel and an example, create
and publish `/agent-guide` with the requested text, and inspect the result.
Participants were instructed to use only the client, live schemas and discovered
materials. Repository/code access was prohibited by instructions, not an OS
sandbox. The controller supplied no source fixture or implementation hints.

| Trial | Discovery and application | Independently observed result |
| --- | --- | --- |
| Baseline collection | Two searches; full Repository overview and authoring guide; stopped because concrete file/Bloc/example formats were absent. Ten commands reached the bridge; one sandbox connection retry was reported separately. | No collection installed and no Page created or published. The participant correctly reported a block. |
| Improved collection | Read the source example, authoring, Page creation and verification guides; 41 commands. | Prepared valid sources, published and installed one Bloc/example; public Page contains the requested text. Browser checks at 375 and 1280 pixels returned 200 without overflow; the participant viewed both screenshots. |
| Improved revision | Read revision and verification guides from tool links after a search transport failure; 13 commands reached the bridge. | A real conflict was refused, followed by reread and a description-only update. The colleague's changed title/heading survived; the Page remained a draft. |
| Improved upload | Found and read site-files through hybrid search; 18 commands. | Private file retained; its signed download contained the exact requested 39 UTF-8 bytes. |

The controller independently read installations, Page/public state, workspace
visibility and downloaded bytes. The success result is three completed missions,
not a statistical success rate. An observer repeated the revision search once
after completion; that extra command is excluded from the participant count.
The original creation example is also compiled directly from the Markdown by
`source-example.test.ts`, without hidden fixture files.

## Retrieval measurement

The same pinned local E5 model and ranking implementation were used before and
after. All ten original multilingual questions found their expected document
in the first three results in both measurements. The additional seven questions
cover first-component source files, HTTP byte transfer, concurrent editorial
changes and asynchronous operation completion. Six of those seven found the
expected document: sixteen direct document hits out of seventeen overall.

The miss was: “Je veux créer mon premier composant réutilisable : quels fichiers
et quel format envoyer ?”. Its first three results included the collection
procedure, which links the source example, but not `collection-source.md`
itself. This remains a direct-ranking limitation; it was not relabelled as a
success. Searches in English, Spanish and Chinese found the new source guide.
These hand-authored relevance labels and the small corpus are not a general
retrieval benchmark. Measured searches made no additional document-body reads.
After background initialization, each made one query-embedding call. The first
measured request overlapped one remaining passage batch and therefore counted
two model calls; it is not a clean warm-query latency sample. Evaluation can be
repeated offline with the populated model cache:

```sh
bun run packages/features/cms-documentation/tests/evaluation.ts \
  packages/runtimes/ulvia-cli/dist/bootstrap /absolute/path/to/model-cache --offline
```

## Friction and follow-up

- The first collection search returned a tool error; its original trace did not
  capture the error code from the text-only Gateway envelope. A shorter retry
  found the guides. The trace parser now also captures that envelope.
- The revision search returned HTTP 400 during Access connection resolution.
  Edge recorded `not_authorized` after about eighteen seconds. The identical
  controller retry succeeded. Three participants and background validation
  were active; the cause was not established. The client now preserves the
  HTTP error body rather than hiding it behind a test assertion.
- Parameterized `text/plain; charset=utf-8` was refused. The upload participant
  recovered with `text/plain`, but the stored/downloaded media type became
  `application/octet-stream`. Byte correctness and privacy passed; requested
  media-type preservation is not established. The guide now describes these
  official Provider constraints explicitly.
- The completion tool description incorrectly promised a listing, while its
  schema, guide and actual output were null. Its description is corrected to
  direct callers to `workspace.get`. These wording refinements followed the
  agent trial; they are not presented as a second blind trial.
- The collection participant's editor catalogue was truncated twice by its
  command-output budget. It increased the capture size; no contextual catalogue
  filtering was added by this task.

The trial demonstrates that supplying the missing source format enabled this
participant to complete the mission. It does not establish causality across
models/seeds, repeatability, good page design, signed-URL expiry or reliable
cold-start authorization. The resulting Page was intentionally plain and had
no interactive controls. Missions supplied all required business details, so
clarification behavior on an ambiguous request was not evaluated. Images,
production Docker and Linux ownership remain outside this trial.

## Verification

The final native directory run passed five tests and 350 assertions, including
the existing complete journeys, the Markdown-derived source example and the
bridge's origin, refusal-recording and per-participant budget checks. The
integration TypeScript project and all ten `check:all` checks passed. The
154-line bridge retains one cohesive command dispatcher and shared recording
boundary; its file-size INFO is retained rather than splitting that boundary
solely to meet the 150-line target.

`verify:full` reached the global test suite: 2,836 passed, fourteen were skipped,
and the same four pre-existing environment failures remained (changed pinned-IP
socket reuse, the URL-encoded workspace path in a build boundary, and two Linux
`flock` ownership tests). It therefore stopped before performance, Edge smoke
and Docker delivery stages. These stages are not claimed as passing.
