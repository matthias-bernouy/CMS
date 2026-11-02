# Installations

Selected contracts, approved Providers, installed collections, upgrades and operation tracking.

## Before using this contract

For an introduction to Ulvia concepts, documentation discovery and verification, read [Working with Ulvia](working-with-ulvia.md).

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `documentation.search`: Search selected contracts and their exact ancestors using natural language or capability names; inspect the returned retrieval mode.
- `documentation.get`: Read an exact document reference from search results or tool metadata, following continuation offsets when present.
- `gateway.audit.append`: Edge control connection only. Persist one immutable Gateway command audit event.
- `apply-collection-upgrade`: Apply one current reviewed release-switch plan. Page documents are never transformed.
- `apply-contract-upgrade`: Atomically apply a current reviewed selection and grant plan without editing site content.
- `approve-provider-connection`: approve provider connection
- `gateway.delegation.close`: Control authority only: close a bounded invocation delegation.
- `import-provider-manifest`: import provider manifest
- `install-collection`: install-collection
- `gateway.delegation.issue`: Control authority only: issue a bounded invocation delegation.
- `gateway.invocation.issue`: Edge control connection only. Issue one short-lived provider invocation token for the current selected route.
- `pair-provider-connection`: Pair or rotate one approved Provider connection. Outgoing capabilities are derived from its approved manifest requirements.
- `gateway.dispatch.prepare`: Edge control connection only. Resolve the provider identity, issue an optional root delegation and sign one invocation after live authority revalidation.
- `gateway.provider.prepare`: Authenticate one opaque Provider credential and prepare its exact machine invocation through the instance authority. Business dispatch remains separate.
- `preview-provider-connection`: preview provider connection
- `gateway.identity.resolve`: Edge control connection only. Resolve or create the stable provider-scoped alias for one CMS subject.
- `gateway.provider.resolve`: gateway provider resolve
- `resume-collection-upgrade`: Resolve a pending release switch using its original pins after an interrupted commit.
- `resume-contract-upgrade`: Resume one durable site contract release switch.
- `set-provider-status`: Enable, disable or terminally revoke one provider installation with revision control.
- `update-collection-configuration`: update-collection-configuration
- `gateway.provider.authorize`: gateway provider authorize
- `gateway.delegation.check`: Control authority only: check a bounded invocation delegation.
- `capabilities.describe`: Read the selected public capability access metadata for one contract, without Provider origins, credentials or business data.
- `get-collection-installation`: get-collection-installation
- `get-collection-upgrade`: Read the status of one exact release-switch intent.
- `get-contract-upgrade`: Read the state of one site contract release switch.
- `gateway.route.get`: Edge control connection only. Return the complete selected Gateway route snapshot for one contract.
- `get-operation`: get-operation
- `get-provider-access`: get provider access
- `get-provider-installation`: Read one provider installation, its observed implementations and its selected contracts.
- `get-site-upgrade-status`: Read the active site release-switch intent and its maintenance fence.
- `list-available-collections`: list-available-collections
- `list-available-providers`: list available providers
- `list-collection-installations`: list-collection-installations
- `list-operations`: list-operations
- `list-provider-installations`: List approved provider installations and their selectable contract routes.
- `list-site-usage`: Read a bounded site usage inventory with catalogue and runtime scopes, resource locations and capability consumers. The cursor pins an exact inventory digest and becomes invalid after any analysed revision changes.
- `plan-collection-upgrade`: Analyse exact collection targets and current site usage without rewriting any content. Incomplete or blocked plans cannot be applied.
- `plan-contract-upgrade`: Review exact site contract selections and capability grants against actual consumers and currently served releases. An optional single selection is merged with the current graph; full selections support coordinated changes.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.
