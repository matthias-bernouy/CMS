# Configure and use Forms

Forms is optional. Select `ulvia/cms.forms` from an admitted Provider offering the
contract, together with its required `ulvia/cms.emailer:emailer.send` capability.
The official implementation requires compatible Emailer 1.x, including admitted
specializations such as SMTP. Forms owns answers; Emailer owns delivery.

Create a closed draft with `forms.create`, supplying a random UUID `formId` and
complete `draft`. Keep that identifier when retrying the same creation. Fields
support text, textarea, email, tel, URL, number, date, checkbox, single-choice,
multiple-choice and consent. Stable field/choice IDs identify answers, never labels.
Each answer is a closed object with `fieldId`, `kind` and exactly its typed value:
`text`, `number`, `boolean` or `optionIds`. Omit optional unanswered fields entirely;
zero and false are values. Required consent must be true.

Draft configuration includes locale, labels/help, validation constraints, public or
authenticated access, opening/closing instants, retention days, visitor messages,
and notification settings. Notification recipients and templates remain private.
Set `notification.enabled` false to retain answers without scheduling email.

Read the current revision before `forms.update-draft`, `forms.publish`,
`forms.set-availability` or `forms.archive`. Publish returns an immutable version
identified by its source revision. Publishing alone leaves availability unchanged.
Later draft changes do not reinterpret retained answers or notifications.

Read `forms.get-public-definition` to obtain fields, current `formVersion` and
`accepting`. Submit through `forms.submit` or `forms.submit-authenticated` matching
`accessMode`, with a random UUID `attemptId`. Reuse that identifier only for the
same attempt and exact input. A success acknowledges durable storage independently
of email. Refresh on a version/availability refusal before asking the visitor to retry.

Administrator HTTP/MCP capabilities read/list submissions, set new/read/processed/
spam status, retry notifications or erase local payload. Follow `next` until absent,
including after an empty visible page. Lists contain summaries without answers.
An unknown send is not automatically repeated; retry explicitly accepts duplicate
risk. Deletion cannot recall email already engaged with a transport.

Technical request/storage/page/rate bounds protect resources. They do not impose
independent totals on forms, publications, submissions, fields, choices or recipients.
