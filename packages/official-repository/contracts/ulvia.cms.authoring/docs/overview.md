# Repository authoring

Prepare, validate and publish immutable collection releases using the configured Repository identity.

## Before using this contract

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `claim-namespace`: Claim a namespace using this instance signing identity. Existing ownership is preserved.
- `discard-preparation`: Discard one local unpublished collection preparation. Published Repository releases are preserved.
- `prepare-collection`: Validate and build a complete collection source snapshot before publishing. Read ulvia://cms/collection-authoring for the source format.
- `publish-collection`: Publish the exact prepared collection digest and retain its private sources in the Repository. This does not install the release on the site.
- `track-namespace`: Remember an existing namespace owned by this instance signing key. No claim or key transfer is performed.
- `get-collection-sources`: Read the private source snapshot of a collection owned by this instance publication identity.
- `get-identity`: Read this instance publication public key; private keys remain in the host secret store.
- `list-namespaces`: List remembered namespaces and verify current ownership live. Follow nextCursor; cached inventory never grants publication rights.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.
