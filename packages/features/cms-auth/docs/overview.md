# Access

Authentication, account lifecycle and administrator-authorized MCP connections.

## Before using this contract

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `authorize-mcp-connection`: Authorize mcp connection
- `confirm-email-verification`: Confirm a local account email with a one-time token.
- `confirm-password-reset`: Confirm a password reset with a one-time token.
- `create-personal-access-token`: Create a token for the authenticated account and return its plaintext secret once.
- `delete-user`: Delete one member, its local credential and personal access tokens.
- `deny-mcp-authorization`: Deny mcp authorization
- `exchange-mcp-token`: Exchange mcp token
- `login-password`: Authenticate a local account and establish a CMS session.
- `logout`: Clear the current CMS session.
- `prepare-mcp-authorization`: Prepare mcp authorization
- `register-mcp-client`: Register mcp client
- `request-email-verification`: Request email verification without disclosing account existence.
- `request-password-reset`: Request a password reset without disclosing account existence.
- `revoke-mcp-connection`: Revoke mcp connection
- `revoke-personal-access-token`: Revoke one token belonging to the authenticated account.
- `set-administrator`: Grant or revoke administrator access with revision control and self-lockout protection.
- `signup`: Create or resume a local CMS account signup.
- `get-user`: Read one CMS member and its administrator state.
- `inspect-actor`: Inspect live membership and authorization revision for a gateway delegation. Signed gateway system authority only.
- `list-mcp-connections`: List mcp connections
- `list-personal-access-tokens`: List the authenticated account's token metadata without revealing secrets.
- `list-users`: List CMS members with exact email search and bounded pagination.
- `resolve-actor`: Resolve one trusted browser credential into the current CMS actor.
- `resolve-mcp-connection`: Resolve mcp connection

## Personal access tokens

Ordinary authenticated accounts can create, list and revoke their own PATs. These operations do not require administrator access and do not grant it. The Provider derives ownership from the verified actor; callers cannot select another account. Tokens inherit the account's current permissions and have no separate scopes.

Provide a nonempty `name` of at most 100 characters and, optionally, a future `expiresAt` date-time. Omitting expiry or passing `null` creates a token without an expiry. Each account may hold at most 32 tokens, including expired tokens until revoked; `TOKEN_LIMIT` means an existing token must be revoked before creating another.

Save the plaintext token securely when creation succeeds. Later reads expose only metadata, including expiry and last use when available. Only a hash is persisted. Revocation makes subsequent authentication with that token fail; it does not revoke browser sessions or other tokens. Token management has HTTP bindings and is not exposed as an MCP tool.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.
