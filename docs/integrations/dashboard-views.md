# Dashboard detail views and forms

`@bernouy/cms-dashboards` defines and validates dashboard contracts.
`@bernouy/cms-integrations` parses integration resources. `@bernouy/cms-control`
composes the admin's static templates and coordinates navigation and drafts.
The document binding runtime in `@bernouy/components` owns reads and form
submission. Integrations own defaults, authorization, revisions, validation,
provider operations and persistence.

The source of truth for operation fields is
[`forms.ts`](../../packages/features/cms-dashboards/src/interfaces/dashboard/forms.ts).
For serialization and refresh events, see [data bindings](../blocs/data-bindings.md).
For outstanding migrations, see [migration status](../quality/integration-views/all-integrations.md).

## Shared read and Save

A `w-detail` has one common `source`. Its optional `itemPath` selects a resource
inside the complete response; field `path` values are relative to that resource.
Main and aside may mix editable and readonly content.

Optional `save` creates one real form containing editable controls from both
columns. Header/footer buttons target it with `form="…"`. The endpoint receives
those controls and declared scalar technical fields, not the whole GET response.

```json
{
  "save": {
    "endpoint": "upsertProduct",
    "label": "Save product",
    "idPath": "id",
    "hiddenFields": [
      { "name": "id", "value": "$resource.id", "type": "number", "empty": "omit" },
      { "name": "expectedVersion", "value": "$resource.version", "type": "number", "empty": "omit" }
    ]
  }
}
```

`endpoint` identifies a declared source endpoint; its declaration supplies the
HTTP method. Optional `sourceId` targets another authorized source. GET and Save
need not share a path or response shape. `valuesPath` prefixes editable names,
while technical fields retain their own names. `confirm` prompts before Save.
Native form operations currently have no `management` target; existing
integration management uses explicit request targets. Settings target
`management: { installationId, operation: "settings" }`. A named action target
uses `management: { installationId, operation: "action", actionId }` and
`valuesPath: "input"`; its technical revision uses `name: "input[expectedVersion]"`.
The composer contributes the declared scalar `actionId` once. The server still
resolves secret/page references and invokes the integration's declared function.
Management actions cannot be used as GET data sources.

A field's submission name defaults to its data path. Optional `name` overrides
it; nested paths become bracket names, such as `metadata[weight]`. Names cannot
collide with another editable or hidden field. `hiddenFields` carry scalar
identities, revisions and constants; they cannot serialize response objects or
refer to `$field` values. Missing required technical values block submission;
`empty: "omit"` permits absent creation identities.

## Values and ownership

Forms use `cms-source-serialization="typed-json"`. Text stays text, numbers must
be finite, and boolean checkboxes submit `false` when unchecked. Selects default
to strings; `valueType` can declare a number or boolean. An API requiring a
boolean property does not imply a checkbox must be checked.

`empty` declares `null` or omission where needed. Readonly, disabled, unnamed or
unmounted controls do not contribute. A field's `visibleWhen` currently controls
conditional mounting: integrations must not interpret an omitted value as an
instruction to erase stored data. Inactive main/aside panel tabs, by contrast,
keep their controls mounted and associated with the form.

Components expose their existing `value`/`checked` properties and native form
association. Table, schema, media and reorderable controls contribute their
editable structured values. An empty list submits `[]`. Editable table `rowKey`
retains a scalar row identity, not an opaque copy of the server row. The endpoint
owns preservation of noneditable properties and the meaning of explicit clears.
An editable JSON field such as Emailer's `sampleDataJson` is business content,
not a widget transport attribute.

`p9r-money-input` displays localized major units and exposes integer minor units
through `value`; the dashboard must not parse its display text again. Currency
and decimal precision come from its declared rules. Uploads use multipart forms,
then contribute media identities to Save; typed JSON forms do not carry files.

## Refresh and draft stability

Successful Save rereads its source with `cms-source-success-reload`; it does not
merge arbitrary mutation response keys into the GET response. Save only supports
`refresh: "read"`. A successful HTTP 204 is valid for an existing resource.

The binding captures the submitted controls and locks the form during the write
and reread. A failed write preserves the draft. A successful write followed by a
failed GET retains the displayed data and offers a read-only retry, without
replaying Save. Readonly refresh state and errors belong to the read source.

Unchanged branches and repeated entries at unchanged positions retain their
nodes. Moving or changing repeated items may recreate rows; no keyed repeat
contract is implied. Ordinary detail edits preserve their shell and controls.
First creation is a navigation transition and can display a loading state.

## Independent actions and deletion

An action's `form` defines its endpoint, technical fields and optional local
`fields`. Fields or `confirm` open an operation dialog; otherwise the button
submits directly. These forms live outside the principal form. Their success
normally rereads the detail; `refresh: "none"` is available when appropriate.
Unsaved principal edits must be resolved before conflicting operations.
Nested navigation-list actions use the enclosing detail's persisted resource and
guard, while their buttons stay in the list header. A form action can declare
`after: { opens, row: "$result.ref" }` to read its destination after success.
Table forms use exactly one checked row as `$row`/`$resource`, with its key in
`$selection.id`; empty, multiple or stale selections cannot submit. Their default
refresh rereads the table. Failed reads can be retried without resubmitting the
mutation, retaining existing rows.

Operation-dialog fields currently support text, textarea, number, money,
checkbox, select, combobox, tokens, secret references and page links. Complex
controls or dependent reads require a full detail view rather than extending a
short operation dialog implicitly. Use `$resource` for persisted eligibility.
The exported `DashboardActionField` type reflects these limits: action fields
cannot declare `visibleWhen` or remote `lookup` options. Full detail fields retain
those capabilities.

Optional `delete` requires confirmation and is hidden before creation. Success
returns to the owning collection; its response is not a replacement resource.
Publication, archive, payment and download operations retain their own semantics.
Do not declare deletion when the integration only provides archive.

## Creation and related resources

A detail with `save` and `create: {}` serves creation and edition. Its GET accepts
an absent identity and returns unpersisted defaults. Save creates without an ID
and updates with one. Revisions and idempotency tokens belong to the integration.
The first success must return a scalar identity at `save.idPath` (default `id`);
for a response envelope the path includes that envelope, such as `field.id`.

Tables and navigation lists open that view with
`create: { viewId: "productDetail", presentation: "page" }`. Optional
`dashboardId` targets another dashboard; `presentation` also accepts `modal`.
Lookup `create`/`edit` references use `modal`, plus `valuePath` and `labelPath`.
Saving a related resource refreshes its label and selection while preserving
the parent's unsaved detail. `allowCustom` alone performs no remote creation.

After first Save, the page navigates to the returned identity and performs GET.
If that GET fails, Retry reads the created resource. A successful creation with
no identity blocks an automatic second creation. Endpoints must supply their
own idempotency guarantees for ambiguous network failures.

## Direct detail navigation

A detail action can select another detail in the same dashboard without calling
an endpoint first:

```json
{
  "id": "parent",
  "label": "Parent",
  "selection": { "opens": "parentDetail", "row": "$resource.parentId" }
}
```

`selection.row` accepts a literal identity or a safe `$resource`/`$selection`
path. It is supported on detail actions and cannot combine with `endpoint`,
`management`, `form`, `download` or `after`. Existing list selection stays unchanged.
The destination source performs its normal GET. Missing or non-scalar identities
fail without navigation. Unsaved changes require explicit discard confirmation;
cancelling keeps the current controls and sends no request. Navigation never
acknowledges a Save or shows a mutation-success notification.

## Page and panel layout

`cms-shell-detail` owns header actions and the body slot. A shared form occupies
that body and contains `cms-shell-detail-body`, which owns main and aside.
Visual components keep styles in shadow DOM; bound content stays in light DOM.

Full detail dialogs use `p9r-modal[placement="end"][content-layout="contained"]`
and `cms-shell-detail[contained]`: fixed header/footer, scrolling body, and the
same section cards/background as pages. `cms-shell-detail-body[tabbed]` retains
columns above 760 px of available width and shows Details/Settings tabs below.
There is no tab bar without aside content. Validation reveals the affected tab;
resizing and switching tabs preserve controls. The panel guards unsaved closure.

## Ordering and media

Navigation `reorderable.action` can reference `form: { endpoint: "reorderBrands" }`.
The form-associated list submits ordered IDs as `ids`, overridable by
`reorderable.name`. Its independent form stays outside a parent detail form.
Automatic reorder does not accept extra fields, confirmation, `after` or disabled
refresh. A failed write restores order; a failed reread retries only GET.

A media field with `persist: "save"` and upload declares
`staging: { sessionField: "uploadSessionId" }`. The first multipart upload lazily
creates a session and returns `{ sessionId, media }`. Later uploads reuse the
session. Save receives ordered media IDs and the scalar session reference.
Integrations own attachment, expiry and cleanup; see [Commerce media](./commerce-media.md).

Connection views use ordinary Source reads and saves. Endpoints that need scoped
references can opt into the admin-only integration context; see
[Integration management](./management.md). The service retains revision checks,
secret grants and integration-owned configuration application.

Navigation reorder forms may include scalar `hiddenFields` for stable parent
identity. Their names must not overlap the ordered list name (including
`valuesPath`). Only the list source reloads; the parent Save remains independent.

Forms uses one creation/edit detail. `saveFormDraft` accepts editable metadata
and an optional numeric `id`; a new form also supplies its stable `key`. It
rejects client definitions. The private `forms.save_form_settings` operation
updates metadata and the draft title atomically, preserving sections, questions,
media reachability and published snapshots. `forms.save_form_draft` remains
internal to builder operations. The SQL regression in the Forms integration
under `tests/verification/settings-save.sql` runs inside a caller-owned local
transaction that must be rolled back.

Question Save uses explicit `imageOptions` as the image editor control name,
while both choice editors read `options` from the shared response. Only the
visible editor submits. Uploads create immutable Forms assets; their association
with the draft changes on Save. Published versions retain their own associations.
Questions have an internal stable identity separate from the editable answer
key. Existing questions retain their original reference on first save; newly
created questions use a UUID. Renaming does not invalidate a subsequent GET.


Consent uses the same detail for creation and publication. Its native save sends
`{ contextKey?, expectedRevision, values: { contextKey?, enabled, documents? } }`.
Creation reads defaults with revision `new`, then opens the returned
`values.contextKey`. Existing context identity is technical and readonly.
Disabling omits hidden document controls and preserves existing evidence.
Stripe Connect publication uses a named management action so published-page
resolution and immutable snapshot verification remain on the server.
The shared page picker is form-associated: `value`, `name`, required validation,
reset and disabled fieldsets work with native forms and typed binding submission.

### Removed action compatibility

Actions submit mutations through `form`; a shared detail save uses `save`.
Legacy `action.management`, mutation `action.endpoint` and `after.resource`
declarations are rejected. `action.endpoint` remains available with `download`
for binary responses. Successful writes reread the common source instead of
merging a response into a separate resource cache.

Token fields use native repeated form entries (`name="tags[]"`), including an
empty array in typed JSON. The token input's ordinary `.value` remains its CSV
string; existing plain-name native forms retain that format. Schema field
submission uses the same draft reader as validation so hidden or opaque metadata
is preserved, including when the schema service is unavailable.
