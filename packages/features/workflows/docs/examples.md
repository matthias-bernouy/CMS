# Workflow examples

## Contact form notification

A portable contact workflow declares two installation parameters: `formId` (UUID) and `recipient` (email). Its trigger is `ulvia/cms.forms` / `submission.created`, with filter `{formId: parameter.formId}`. The contract's schema resolver describes that exact form; publication checks the configured form's `textarea` field. Configure this field with `minLength: 1` and a maximum length compatible with Emailer text; a schema permitting an empty string cannot satisfy Emailer's non-empty text input, even after an existence guard. A condition checks whether projected event data and that optional answer exist, then maps the answer to the `text` input of `ulvia/cms.emailer` / `emailer.send`.

The same package can be installed twice with two form IDs and recipients. Configuration values and immutable plans belong to each instance. The source answer remains a native typed string, not an unchecked JSON string. A form with a number at that property cannot satisfy the email text mapping. Sensitive answers are excluded and cannot satisfy that mapping either.

Renaming a display label or adding an unused field preserves the workflow. Removing its `textarea` field is allowed at the source and suspends the trigger when detected. `triggers.list` reports the diagnostic. Repair the source or publish an adapted workflow, validate and explicitly reactivate with `triggers.update`. Suspended occurrences are acknowledged without creating runs; reactivation does not replay them.

## Payment and order conditions

Another contract can declare `payment.succeeded` with a fixed object schema containing `orderId` and `amount`. A workflow can compare `trigger.data.amount` with a literal threshold, call an order capability in one branch and a notification capability in another, and map typed successful outputs into subsequent inputs. A declared error can route to its own typed branch using an `error` expression. The contract IDs and compatible version ranges are portable requirements; selected implementations and instance credentials are resolved locally.

Providers emit business facts through the typed SDK `eventsFor(feature, durablePublisher)` helper. The producer chooses one stable occurrence ID per fact and persists its publication intent with the business mutation. Retries keep that ID. Events validates against the admitted contract and each resolved field schema, filters sensitive data, then pushes the common receiver envelope. A workflow run is deduplicated by delivery receipt.

## Scope and recovery

JSON expressions support objects, arrays, literals, parameters, input/event/step/error paths, existence checks and comparisons. They do not run scripts or concatenate arbitrary templates. Calls use admitted capability bindings and verified administrator authority. External services such as Shopify or Notion need a Provider contract exposing their capabilities and business events. External webhook creation is outside this version.

A next call that becomes incompatible suspends an accepted run. Its previous outputs and completed checkpoints remain frozen. After repair, `runs.resume` validates remaining calls and resumes that run; it does not repeat completed steps. Unknown non-idempotent outcomes still need an explicit administrative resolution.
