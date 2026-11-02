# Documentation application evaluation

This harness exposes a private native CMS to a language-model agent through a
small client. It records actual MCP requests, documentation reads, refusals and
browser inspections. The controller independently reads final CMS state; an
agent's completion claim is not the success criterion.

## Start and use

Use the native journey prerequisites from [the parent guide](../README.md).
From the workspace root:

```sh
ULVIA_DOCUMENTATION_CHROMIUM="/absolute/path/to/chromium" \
ULVIA_DOCUMENTATION_MODEL_CACHE="/absolute/path/to/populated/model-cache" \
bun run test:documentation:agent /private/tmp/my-documentation-trial
```

Wait for the ready JSON containing `session`, `cmsUrl` and `pageId`. Each agent
starts with fresh context. Give it the client usage and one mission below, with
instructions to use only this client, never repository or implementation
sources, prior trials, or another participant. This is an instruction boundary,
not an OS security sandbox. Returned screenshots are permitted evidence.

```sh
bun run test:documentation:client /private/tmp/my-documentation-trial/session.json collection catalogue
bun run test:documentation:client /private/tmp/my-documentation-trial/session.json collection describe <<'JSON'
{"name":"installations_documentation_search"}
JSON
```

Commands accept JSON on stdin except `catalogue`. `describe` returns a live tool
schema. `rpc` takes `{method, params}` for ordinary MCP calls. `http` takes
`{method, url, headers, body}` for same-origin GET/PUT; the client injects its
existing MCP bearer and leaves upload headers to the agent. `browse` takes
`{url, width}` and returns real Chrome observations and a screenshot. It blocks
cross-origin browser requests. MCP examples use the actual `tools/call` envelope
`{name, arguments: {input}}`, including a sibling idempotency key where required.

Each lane has a 60-command budget. The host expires after twenty minutes. Keep
session files private; do not share their contents or copy tokens into reports.
For controller-only probes use the `observer` lane to avoid contaminating agent
counts. The controller can request `score` and then `close`; both need no stdin.
Close removes the native processes and their temporary business state, retaining
only the chosen trial directory with its metadata trace and screenshots.

## Missions and criteria

Give the collection participant this objective without source examples or
implementation hints: publish and install `agent-authoring/agent-kit@1.0.0`
with one panel Bloc and an example; create `/agent-guide`, title `Agent guide`,
from that example; change visible prose to `Documentation applied`; publish it
and report observable checks. No binary asset is required. Evaluate installed
state, public response/content and recorded browser inspections.

Give the revision participant the ready Page ID and ask it to change only its
description to `Updated description after review`, preserving other authors'
saved work and keeping the Page unpublished. The host changes its title and
heading after the participant's first read, forcing a real revision conflict.
Evaluate the description, preservation of the colleague's fields, draft state
and recorded read/retry sequence.

Ask the upload participant to store private `agent-upload.txt` with exact UTF-8
bytes `Uploaded through documented transport.` followed by one newline, obtain
its immutable identity, verify its privacy and a signed download, and retain
the file. Evaluate the stored generation, private visibility and exact bytes.

An independent process is required to compare before/after immutable releases:
changing authored Markdown does not mutate a running instance's admitted
release. Keep mission wording and access instructions stable across trials.

## Interpretation

This is an interactive evaluation harness, not an automatic model API runner.
Use fresh agent contexts and retain commands, refusals and final observations.
Read [the recorded first trial](RESULTS.md) for its findings and limits. A single
successful trial does not estimate reliability or establish good visual design.
The private Repository uses real signed feature operations; production Linux
ownership and Docker images remain separate validation targets.

## Second-round variants

Append `--round2` to the host command to seed a published `/rendez-vous` Page
and suppress the first successful upload completion reply. This is a synthetic
transport failure after the real mutation: the controller records the actual
success and suppression, while the participant receives only a lost-reply error.
It does not simulate a database rollback or a Provider crash. Ask the upload
participant to store `Vérifié — 中文 🚀` followed by exactly one newline instead
of the first trial's ASCII content. The score compares downloaded bytes,
private visibility, matching file count and successful upload-session creations.

The `clarification` lane supports a two-turn customer conversation. First ask
for a Contact Page for a practice, including contact details and an appointment
button, without supplying those details. Let the participant inspect existing
state and ask essential questions in its final response. Before replying, save
the independent score to check for premature publication. Then provide fictional
business facts and the existing `/rendez-vous` target. Do not supply capability,
document or markup hints. Score and inspect the final public contact content
and target response. These variants exercise ambiguity and uncertain outcomes;
they are separate missions, not controlled reruns of the first trial.
Read [the second trial](SECOND-TRIAL.md) for the observed outcomes and limits.
