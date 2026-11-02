# Second documentation application trial

Observed on 2026-11-02 with three fresh agent contexts against one private native
MongoDB, Repository, Provider and Edge stack. No public Repository was used.
Participants received business goals and client usage, without source examples,
document paths or capability hints. The access restriction was instructional,
not an OS sandbox. No model override was requested; the exact inherited model
identifier is not exposed by the collaboration tool.

## Agent missions

| Mission | Observed behavior | Independent evidence |
| --- | --- | --- |
| Collection and Page, reformulated in French | Discovered source, authoring, Page creation and verification guides; prepared, published and installed the panel/example collection; published the requested Page. | 43 commands, one search, four document reads. Browser checks at 375 and 1280 pixels returned 200 with the requested text and no overflow. The controller also inspected the mobile screenshot: deliberately plain text, not evidence of sophisticated design. |
| Private Unicode file, requested in Spanish | Counted 26 UTF-8 bytes; uploaded once; after a lost completion reply, read workspace state instead of repeating the mutation; signed and downloaded the retained generation. | 17 commands, one search, one guide. The controller found one matching private file, one successful upload-session creation and exact decoded content `Vérifié — 中文 🚀` followed by one newline. The participant also checked download length 26 and the generation ETag. |
| Underspecified Contact Page | Inspected existing Pages and documentation, asked for missing facts, then created and published the supplied content and checked the appointment target. | 27 commands total, two searches, two guide reads. Before the reply: ten commands and no Contact Page created/published. Final public content contains the supplied name, email and address; its appointment link targets `/rendez-vous`, which returns 200. |

For the Contact mission the customer initially said only: “Fais une page Contact
pour mon cabinet, avec les coordonnées et un bouton pour prendre rendez-vous.
Mets-la en ligne quand c’est prêt.” The participant asked for the practice name,
address, phone, email and whether to use the existing `/rendez-vous` Page or an
external reservation link. The controller then supplied fictional facts:
Cabinet Horizon, administrative consulting, `contact@cabinet-horizon.invalid`,
12 rue des Exemples, 75000 Paris, no phone, `/rendez-vous`, new path
`/contact-cabinet`, title `Contact — Cabinet Horizon`, and permission to publish
when ready. No implementation guidance was supplied.

The Contact Page returned 200 at 375 and 1280 pixels with no horizontal overflow.
The participant viewed its screenshots and checked the appointment target, then
reread Page state to confirm publication. The controller independently inspected
the mobile screenshot: readable contact details and button, no phone or invented
commercial claims. The appointment destination contains only a heading; a
functioning reservation system was not part of this mission. An agent-platform
routing 401 interrupted the second turn once; it was resumed with the same
context. This error was outside the CMS trace and is not a CMS authorization
failure or a new independent trial.

The upload reply loss is a controlled bridge fault after a real successful
`workspace.upload.complete`; it is not a random network failure or a Provider
crash. The actual success and suppressed reply are recorded in the trace. A
focused bridge test verifies that state is committed/readable before the error
and that only the first completion reply is suppressed.

## Friction and interpretation

The first collection search took about twelve seconds and returned explicit
lexical degraded mode. The agent still found the source format. Its first
editor-catalogue output exceeded its command-output parser capacity; it reread
with local output filtering. A draft's public URL returned 404 before
publication, followed by successful public checks. These were recoverable
observations, not false mutation success claims.

The Unicode upload again retained `application/octet-stream` despite requesting
`text/plain`. Exact bytes, immutable identity and stored private visibility
passed; media-type preservation remains a limitation. A signed download does
not independently prove every unauthorized download route refuses access.
After the trial, the controller comparator was strengthened from decoded-text
equality to byte-array equality for future runs. The recorded score used the
decoded-text comparison and is not presented as a rerun of that refinement.

These are individual mission observations, not a success-rate estimate or a
controlled causal comparison. The second round adds uncertainty and customer
clarification; the revision-conflict mission from the first round was not rerun.
There was no background `check:all` or model benchmark during these agent calls.

Raw local artifacts are retained in `/private/tmp/ulvia-agent-round2`: metadata
events, independent scores and browser screenshots. Session files contain
credentials and must not be copied into reports. Temporary business state and
native processes are removed when the host closes.

## Verification

The complete native directory run passed six tests and 360 assertions; its cold
matrix was skipped there and run separately twice. Both instrumented cold runs
passed (94 and 95 assertions). The additional lifecycle regression test passed
five assertions. Read [the cold observations](../cold/RESULTS.md) for the initial
panic, unresolved authorization failure and measured lexical misses.

The integration TypeScript project passed. Before and after checks each passed
all ten `check:all` checks. Formatting, `git diff --check` and nine local link
targets passed. The 172-line bridge retains its cohesive command dispatch and
recording boundary; the 158-line native harness retains composition ownership.
Their file-size INFO findings remain, while lifecycle management now has its
own small module. No directory-fanout error was introduced.

Final `verify:full` reached the global tests: 2,838 passed, fifteen were skipped
and the same four pre-existing failures remained: changed pinned-IP socket
reuse, the URL-encoded workspace path in a build boundary, and two Linux `flock`
ownership cases on macOS. It stopped before performance, Edge smoke and Docker
delivery stages, which are not claimed as passing. Raw output is retained at
`/tmp/ulvia-agent2-verify-full-final.log`. Final process inspection found no
remaining native CMS test processes. No production runtime correction is
claimed from these test-only changes.
