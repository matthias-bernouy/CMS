# Edit and delete site compositions

Use `site-blocs.read` to read a complete site-owned composition before editing.
The existing `site-blocs.get` and `site-blocs.list` retain their metadata-only
responses. Collection resources remain immutable and are not site compositions.

## Edit a draft

The detailed response contains `draftJson` and nullable `publishedJson`, plus
current lifecycle, revisions, definition identity and group membership. Each JSON string represents
the existing structured snapshot: `name`, `group`, `description`, `structure`,
`slots`, `defaultContent` and derived `dependencies`. The bounded JSON document
preserves the recursive tree without introducing a second markup grammar.

Parse `draftJson`, edit the intended fields and serialize it for
`site-blocs.update` with `tag`, `definitionId` and the current `revision`. Preserve stable slot
IDs, placeholders and defaults. Dependencies are recomputed from structure and
cannot grant authority. Identity, ownership and group membership are not draft
fields. Archived compositions must be restored before editing.

Creation and editing enforce 4 MiB UTF-8, 16,384 structure nodes
and 64 structure levels. Reads preserve existing snapshots within the byte limit,
including older compositions beyond the new node/depth limits, so they can be
reduced and saved. `site-blocs.identity` returns revisions and the definition
identity even when the source exceeds the read byte limit; use it for safe deletion.
Oversized source responses are refused without truncation. A successful save
increments the draft revision; it does not change the published artifact.
Use the existing `site-blocs.publish` with the new revision when publication
is authorized. Published slot contracts and expanded Page validation still apply.
After a revision conflict, reread before reconciling edits.

## Delete an unused local composition

`site-blocs.delete` permanently removes the local definition and its publication.
Supply the current draft revision and `definitionId` from the detailed read. The identity prevents an old command from affecting a new composition recreated under the same tag. Both unpublished drafts and formerly published
compositions can be deleted; archive/restore remain the reversible alternative.

Any Page reference, including unpublished Pages, blocks deletion. Other Blocs'
fixed dependencies and composition draft/published dependencies also block it,
including archived consumers. `BLOC_REFERENCED` returns up to 16 resource identities
and `truncated` when more exist. Remove those references and reread the revision
before trying again. Deletion never removes a consuming Page or collection release.

Drafts may reference future dependencies; publication requires those dependencies
to be available. Recreating a deleted tag produces a new definition identity.
Always reread it before editing or deleting the replacement.

## Handle refusals

After `REVISION_CONFLICT` or `STATE_CONFLICT`, reread the composition and review
its current lifecycle and revisions before retrying. An archive that occurred
during editing may require restoration first. `INVALID_SITE_BLOC` requires
correcting the draft; retrying the same document does not fix it.

`REFERENCE_CHECK_INCOMPLETE` means deletion could not verify the consumers;
it does not authorize deletion. Retry later. If `CORE_UNAVAILABLE` persists,
report the failure to the site operator. A transport failure can leave a mutation
outcome unknown: read the current state before repeating the command.
