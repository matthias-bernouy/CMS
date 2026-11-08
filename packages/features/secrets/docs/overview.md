# Secrets

Manage scoped secret namespaces, metadata, keys and authorized secret resolution.

## Before using this contract

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `namespace.keys.create`: Create another scoped secret namespace credential.
- `namespace.create`: Create a credential-owned secret namespace.
- `secrets.create`: Create an encrypted secret inside one credential-owned namespace.
- `namespace.delete`: Delete a secret namespace and all encrypted values it owns.
- `secrets.delete`: Delete one secret from a credential-owned namespace.
- `namespace.keys.revoke`: Revoke one secret namespace credential.
- `namespace.keys.rotate`: Replace and revoke one secret namespace credential.
- `secrets.rotate`: Replace one secret value while preserving its namespace identity.
- `secrets.get-metadata-by-name`: Read secret metadata by its namespace-local name without exposing its value.
- `secrets.get-metadata`: Read secret metadata without exposing its value.
- `namespace.get`: Read one secret namespace with a management credential.
- `secrets.list`: List bounded secret metadata from one namespace without values.
- `secrets.resolve`: Resolve one secret value using a namespace credential with explicit resolve permission.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.
