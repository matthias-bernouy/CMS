# Files

Instance-scoped files, uploads, generations, visibility and access keys.

## Before using this contract

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `upload.complete`: Finalize an uploaded blob into an immutable generation.
- `workspace.upload.complete`: Complete an upload in the server-managed site workspace.
- `namespace.keys.create`: Create another scoped namespace credential.
- `namespace.create`: Create a credential-owned file namespace.
- `upload.create`: Create a bounded upload session, optionally targeting an existing stable file identity.
- `workspace.upload.create`: Create an upload session in the server-managed site workspace.
- `files.delete`: Delete every generation of one file.
- `namespace.delete`: Delete a namespace and all of its files.
- `workspace.files.delete`: Delete every generation of a file in the server-managed site workspace.
- `files.make-private`: Make a file private.
- `files.publish`: Make a file public.
- `namespace.keys.revoke`: Revoke one namespace credential.
- `namespace.keys.rotate`: Replace and revoke one namespace credential.
- `workspace.files.set-visibility`: Set whether a site workspace file is public or private.
- `files.sign`: Mint a temporary private read URL.
- `representations.sign`: Mint temporary private URLs for available image representations.
- `workspace.files.sign`: Create a short-lived private read URL for a site workspace file generation.
- `files.update`: Update mutable file metadata.
- `workspace.files.update`: Rename a file in the server-managed site workspace.
- `upload.write`: Stream the exact bytes for an upload session.
- `files.get`: Get the latest generation metadata for a file.
- `namespace.get`: Read one namespace with a management credential.
- `workspace.get`: Read the server-managed site file workspace without disclosing its namespace credential.
- `files.list`: List immutable file generations in a namespace.
- `representations.list`: List available image representations.
- `files.read`: Stream one immutable public or signed private file generation.
- `representations.read`: Stream one immutable image representation.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.
