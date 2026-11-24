# Workflow package sources

Use `prepare-workflow` with a source snapshot containing one `definition.json`. Workflow packages are declarative JSON; they cannot contain executable modules, network connectors, credentials or installation IDs. Read the returned diagnostics and publish only a valid exact preparation with `publish-workflow`. `get-workflow-sources` and `get-source-snapshot` read private sources through the configured account-owned namespace.

The definition declares `kind: "workflow"`, `format: "ulvia-workflow-manifest/v1"`, a namespace-qualified `workflowId`, matching `publisherId`, `name`, canonical semantic `version`, `requirements` and `definition`. Optional description and bounded Markdown documentation explain configuration and expected effects.

Requirements name contracts, compatible version ranges, and the exact capability/event IDs used by the graph. Each requirement needs one jointly satisfying non-yanked contract release. Admission does not install a Provider or grant execution. A package has no instance configuration values.

The nested definition uses `format: "ulvia-workflow/v1"`, object `parametersSchema` and `inputSchema`, JSON `outputSchema`, `entry`, `steps`, and an `output` expression. An optional trigger names `{kind: "event", contractId, eventType}`. A resource event also declares a selector expression built from installation parameters. Calls reference declared capabilities; conditions and typed JSON expressions provide branches and mappings. Loops, scripts, parallel branches and binary values are unsupported.

Installing the exact package creates instance-local configuration. Validate it against currently selected contracts before publishing a frozen execution plan. Activation is an administrator action. Changing the package version or parameters requires a new configuration revision and publication; existing runs retain their original plan.
