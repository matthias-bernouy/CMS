# Observability

Read and append bounded, instance-scoped diagnostic journal records.

## Before using this contract

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `logs.append`: Append an authenticated machine batch. Instance and emitter identity are supplied by verified invocation context.
- `logs.aggregate`: Count retained diagnostic records by one predefined dimension. These counts are not request-rate or performance metrics.
- `logs.get`: Read one retained log entry in the authenticated instance.
- `logs.query`: Search retained logs on the server. The default time window is the previous 24 hours; cursors are scoped to the same filters and instance.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.
