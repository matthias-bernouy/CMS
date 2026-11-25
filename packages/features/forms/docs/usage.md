# Configure and use Forms

Forms is optional. Select `ulvia/cms.forms` 2.x from an admitted Provider. Its
submission Event publication requires `ulvia/cms.events:events.publish`; Emailer
is not a Forms requirement. Forms owns definitions, retained answers and durable
submission Event intents. Workflows own downstream actions such as notifications.

Create a closed draft with `forms.create-v2`, supplying a random UUID `formId` and
complete `draft`. Keep that identifier when retrying the same creation. Fields
support text, textarea, email, tel, URL, number, date, checkbox, single-choice,
multiple-choice and consent. Stable field/choice IDs identify answers, never labels.
Each answer is a closed object with `fieldId`, `kind` and exactly its typed value:
`text`, `number`, `boolean` or `optionIds`. Omit optional unanswered fields entirely;
zero and false are values. Required consent must be true.

Draft configuration includes locale, labels/help, validation constraints, public or
authenticated access, opening/closing instants, retention days and visitor messages.
There are no notification recipients, templates or email settings in a Form.

Read the current revision before `forms.update-draft-v2`, `forms.publish-v2`,
`forms.set-availability-v2` or `forms.archive-v2`. Publish returns an immutable version
identified by its source revision. Publishing alone leaves availability unchanged.
Later draft changes do not reinterpret retained answers.

Read `forms.get-public-definition-v2` to obtain fields, current `formVersion` and
`accepting`. Submit through `forms.submit-v2` or `forms.submit-authenticated-v2` matching
`accessMode`, with a random UUID `attemptId`. Reuse it only for the same attempt
and exact input. Success acknowledges durable answers and their Event intent,
independently of downstream effects. Refresh after a version/availability refusal.

Administrator HTTP/MCP capabilities read/list submissions, set new/read/processed/
spam status or erase local payload. Follow `next` until absent, including after an
empty visible page. Lists contain summaries without answers. Background retention
erases expired answers while minimal receipts preserve seven-day replay protection.
Deleting local answers does not recall published Events or downstream effects.

`submission.created` carries the form/version, submission ID, receipt time and
schema-resolved answers. Workflows select `formId`; publication resolves the exact
answer schema. Sensitive fields are filtered before delivery. Verified initiator
metadata is retained independently of the business payload.

For email, install and configure the optional official
`ulvia/form-submission-email` Workflow, then explicitly publish and activate it.
It uses an immutable Email Template publication and the selected Emailer. Its
standard variables are `submissionId`, `formId` and `receivedAt`. Map permitted
answer fields explicitly in a custom variant; no automatic answer dump is sent.
Notification diagnostics, retries and uncertain effects belong to Workflow runs.
