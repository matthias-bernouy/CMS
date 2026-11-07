# Email delivery

Send email through the selected implementation. Sender configuration is implementation-specific.

## Before using this contract

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `emailer.send`: Deliver one fully composed outbound email through the configured transport.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.
