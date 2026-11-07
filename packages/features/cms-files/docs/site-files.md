# Upload and verify a site file

The instance's managed file workspace is separate from arbitrary file namespaces. Use the selected `workspace.*` capabilities for site authoring assets.

## Upload bytes

Call `workspace.upload.create` with `filename`, the byte `size`, and optional media type and visibility. For text, count UTF-8 bytes rather than JavaScript string length. Set `visibility: "private"` explicitly when the task requires privacy. Keep the returned `uploadId`, `uploadToken`, expiry and byte budget.

The official Provider currently accepts a bare media type such as `text/plain`, and refuses parameterized forms such as `text/plain; charset=utf-8`. Stored media type can be inferred or normalized independently of that hint; inspect the returned file metadata when a specific type matters. Successful byte preservation does not guarantee the requested download media type.

For the official Edge MCP transport, send the file bytes to the returned `uploadUrl`:

```http
PUT <returned-uploadUrl>
Authorization: Bearer <current-MCP-access-token>
Upload-Token: <returned-uploadToken>

<raw file bytes>
```

Use the returned URL exactly. This is an HTTP transfer outside `tools/call`, not a JSON/base64 tool argument. An authenticated client may supply the MCP bearer automatically; it still needs the returned `Upload-Token`. A successful transfer returns HTTP 204. Do not forward either credential to another origin or instance. If the client cannot send bytes through HTTP, report that limitation before claiming an upload.

## Complete and inspect

After HTTP transfer succeeds, call `workspace.upload.complete` with `uploadId`. Its null success result is expected; it does not return the stored file metadata. Read `workspace.get` to obtain the file's exact `fileId` and immutable `generation`, checking name, size and media type. Follow pagination when returned and disambiguate duplicate names rather than choosing an unrelated file.

To verify a private download, call `workspace.files.sign` with that `fileId`, `generation` and `expiresIn` in seconds. Fetch the returned URL and compare its bytes with the original. Signed URLs expire; use immutable IDs and generations for collection source assets, rather than storing a temporary URL as their identity.

## Failure and cleanup

`UPLOAD_NOT_READY` means completion is premature; inspect the transfer outcome rather than starting unrelated sessions. A refusal on the HTTP byte transfer must be resolved before completion. Branch on declared codes and use the localized message for explanation.

After an uncertain response, inspect the existing upload/file state before creating another file. Do not blindly repeat a completed mutation. Delete only temporary files authorized by the task. A private workspace file copied into a published collection becomes a packaged release resource; verify that publication is intended.
