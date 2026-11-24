# Administrator workflows

Workflows executes declarative JSON plans through currently authorized capabilities. Every management operation requires an active administrator. The technical `events.receive` receiver additionally requires authenticated host delivery authority; event data never grants administrator rights.

## Install a reusable package

Find an exact Workflow artifact in a configured Repository. Use `installations.install` with a stable local installation ID, exact repository/publisher/workflow/version/digest reference and parameter JSON. Installing does not activate a trigger. Inspect configuration with `installations.get`, page metadata with `installations.list`, and change parameters with revision-checked `installations.configure`.

Use `installations.validate` before `installations.publish`. Diagnostics identify unavailable contracts, incompatible selected versions, invalid selectors or mappings. Publication fixes actual capability destinations, source definitions, resource schemas and parameter values. `installations.upgrade` explicitly chooses another exact version of the same package identity. Publish that new configuration separately. Prepared plans cannot start runs until publication has committed durably. An interrupted confirmation is finished from that stored decision, without recompiling against changed dependencies. Inspect or retry the same installation/revision after an interrupted response.

Use `triggers.create` to activate the returned published workflow ID/revision. `triggers.update` switches a trigger with revision checks; `triggers.delete` removes it. `installations.remove` prevents new starts, retires installed publications and removes their triggers while existing runs retain their frozen plans. Interrupted removal is recovered with current administrator checks.

## Define and validate mappings

A definition contains `parametersSchema`, `inputSchema`, `outputSchema`, `entry`, `steps` and an output expression. Expressions reference `parameter`, manual `input`, projected `trigger`, completed `step` outputs or declared `error` results. Construct JSON objects/arrays and use existence guards or typed comparisons. Conditions branch to steps; calls map typed inputs to declared capabilities and can route declared error codes.

A trigger references a contract event. A trigger can specify a `filter` expression built from literals and installation parameters. Only the source event’s declared `filterKeys` can be filtered. Dynamic fields carry their own resolver references in the shared schema. For a contact workflow, a `formId` parameter selects a published form; the standard contract resolver provides its fields and types. Sensitive fields are removed before authoring/execution projection. Optional data and fields require existence guards.

Only JSON steps are supported. Operation capabilities need a verifiable terminal result reader. Scripts, arbitrary HTTP, loops, parallel execution, binary streams, Gateway call interception and external webhook creation are unavailable.

## Local authoring and execution

`definitions.create/get/update/validate/publish` support instance-local drafts with parameter JSON. `definitions.retire` disables a publication for new starts. Installed package plans use a reserved internal identity and cannot be replaced by local drafts. Published plans and resumable runs retain exact dependencies.

Manual plans start through `runs.start`; event plans start through durable delivery. Inspect metadata with `runs.get/list`, cancel subsequent work with `runs.cancel`, or use `runs.resume` to resolve/retry suspended work. Every step rechecks the stored administrator. Completed steps are checkpointed. Retried keyed commands reuse their key; an uncertain non-idempotent effect suspends rather than being assumed failed. Cancellation cannot recall an already dispatched effect.

## Source and capability changes

Source owners may change, close or archive their resources independently, including on another Provider. Workflow does not reserve schemas or block those mutations. The current resource schema is compared with the fields consumed by each active plan. Compatible changes, label changes and removal of unused fields leave the trigger active. Whole-object mappings consume that whole object; checking an object's existence does not consume all its fields.

An incompatible source or capability suspends the trigger with a diagnostic code and path. Inspect `triggers.list` and call `triggers.revalidate` for an immediate check. The runtime also revalidates retained active triggers in bounded background pages and before accepting new event runs. Detection is eventual; a remote source change does not create an instantaneous cross-Provider lock. A temporarily unavailable Provider or resolver defers validation and retries delivery.

Suspended triggers accept no new runs. They remain suspended after repair until an administrator validates and explicitly calls `triggers.update` against a compatible published plan. Occurrences discarded while suspended are acknowledged, not replayed after reactivation. Deliveries addressed to a superseded subscription generation are also acknowledged without creating new runs or changing the replacement trigger. Existing accepted runs retain their plan and data. Each next capability call is checked before dispatch; incompatible calls suspend that run with `failureCode` and `failurePath`. Repair and `runs.resume` continue its checkpoints without rerunning completed steps. Compatible selected capability releases can execute the pinned JSON contract through validated output projection. Uncertain effects still require the existing explicit recovery decision.


## Data retention

The official runtime purges succeeded, failed and cancelled runs and their encrypted inputs/outputs seven days after their terminal checkpoint. A failed run can be resumed before that purge; resuming cancels its scheduled purge. Queued, running, waiting, suspended and uncertain-outcome runs remain available for recovery. Purging fences competing resumes and late value writes, removes values in bounded batches, and resumes after interruption. Minimal delivery receipts remain for the 30-day deduplication window without retaining run inputs/outputs. Unregistered run preparations are also purged after seven days. Cleanup reserves the run identity atomically, so it cannot delete the inputs of a concurrently accepted run. Cleanup is asynchronous; expired run data is removed by the background worker, including after a cold restart. Published definitions, parameters and plans remain configuration until explicitly retired or removed; they are not run inputs/outputs.

Manual run IDs cannot use the reserved `definition:` or `installation:` value-storage prefixes.

## Dynamic capability inputs and outputs

Capabilities can use the same `resolved` node as events. Publication materializes their input/output schemas before checking mappings and stores those concrete views in the immutable plan. Selectors must be known from literals or installation parameters. A selector derived from a future step or unknown manual input is refused with `schemaSelectorMustBeKnown`; an unknown shape never becomes an unchecked JSON mapping. Output nodes can reference the original call input with `source: "input"`. An output selector available only in the future response cannot be statically bound in this V1.

Invocation resolves and validates the live schemas again, and checks compatibility with the published plan before dispatch. Providers must increment the resource version when changing its schema. A version conflict is a durable diagnostic; a temporary resolver outage remains retryable. Ordinary direct calls can resolve selectors from their actual runtime input even when workflow publication cannot know them in advance.
