# Edit without overwriting concurrent changes

Page revisions describe the state read by the caller. They are not counters that clients should invent or increment locally.

## Read before editing

Call `pages.get`, retain its revision and inspect the fields relevant to the task. With the current contract, `pages.update` takes the Page `id` and that `expectedRevision`. Supply only fields you intend to change. For example, a description-only update does not need to resend content or title. Follow the selected tool schema if using a different release.

## Handle a conflict

On `REVISION_CONFLICT`, the attempted write did not apply. Reread the Page and compare the relevant fields with the version originally read. Reconcile the intended edit with the newly saved state. Ask the user when conflicting intentions cannot be resolved from context. Never bypass the conflict by repeatedly substituting the latest revision without reviewing the changed content.

For example, if you are changing only the description while a colleague changed the heading, reread the Page and preserve the colleague's heading and other fields. Submit the description with the newly read revision. Do not restore the old HTML simply because it was present in your first read. For edits to the same content, inspect and merge the actual changes before retrying.

## Verify after editing

Read back the Page and verify both the requested change and any concurrent fields that must be preserved. Read and write response projections can contain different additional fields; verify the saved state through reads. Preserve visibility when publication was not requested. Publication also requires a current revision; an accepted edit does not publish a draft.

See [page verification](verify.md). Following an uncertain network failure, inspect state before retrying: commands that do not declare idempotency may already have succeeded.
