import type { DeclarativeConnectorSchemaContract, DeclarativeConnectorTemplate } from "@bernouy/cms-integrations";
import type { IntegrationCompatibilityPackage } from "../../../interfaces/compatibility";
import type { CompatibilityChangeSink } from "../changes";
import { compareConnectorFunctions } from "../function";
import { compareConnectorSchemas } from "../schema";
import { compareDefinitionArtifacts } from "./artifacts";
import { compareDefinitionBindings } from "./bindings";

export function compareIntegrationDefinitions(
    baseline: IntegrationCompatibilityPackage,
    candidate: IntegrationCompatibilityPackage,
    changedPaths: ReadonlySet<string>,
    add: CompatibilityChangeSink,
): void {
    compareDefinitionBindings(baseline.definition, candidate.definition, add);
    compareDefinitionArtifacts(baseline.definition, candidate.definition, add);
    compareConnectors(baseline, candidate, changedPaths, add);
}

function compareConnectors(
    baseline: IntegrationCompatibilityPackage,
    candidate: IntegrationCompatibilityPackage,
    changedPaths: ReadonlySet<string>,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map(
        (baseline.definition.connectors ?? []).map((connector) => [connectorIdentity(connector), connector]),
    );
    const next = new Map(
        (candidate.definition.connectors ?? []).map((connector) => [connectorIdentity(connector), connector]),
    );
    for (const [identity, connector] of previous) {
        const candidateConnector = next.get(identity);
        const path = `connectors.${identity}`;
        if (!candidateConnector) {
            add("breaking", "definition", "connector-removed", path, "Connector was removed or renamed");
            continue;
        }
        compareConnectorSchema(baseline, connector, candidateConnector, path, add);
        compareConnectorFunctions(connector, candidateConnector, changedPaths, path, add);
    }
    for (const [identity] of next) {
        if (!previous.has(identity)) {
            add("additive", "definition", "connector-added", `connectors.${identity}`, "Connector was added");
        }
    }
}

function compareConnectorSchema(
    baselinePackage: IntegrationCompatibilityPackage,
    baseline: DeclarativeConnectorTemplate,
    candidate: DeclarativeConnectorTemplate,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previousSchema = baseline.compatibility?.schema ?? reviewedSchema(baselinePackage, baseline);
    const nextSchema = candidate.compatibility?.schema;
    if ((baseline.schemas?.length ?? 0) > 0 && !previousSchema) {
        add(
            "unknown",
            "schema",
            "legacy-schema-baseline-missing",
            `${path}.schema`,
            "SQL baseline has no digest-bound reviewed schema contract",
        );
    } else if (previousSchema && !nextSchema) {
        add(
            "unknown",
            "schema",
            "schema-contract-removed",
            `${path}.schema`,
            "SQL schema contract is no longer comparable",
        );
    } else if (previousSchema && nextSchema) {
        compareConnectorSchemas(previousSchema, nextSchema, `${path}.schema.namespaces`, add);
    } else if (!previousSchema && nextSchema) {
        add("additive", "schema", "schema-contract-added", `${path}.schema`, "Connector schema contract was added");
    }
}

function reviewedSchema(
    packageState: IntegrationCompatibilityPackage,
    connector: DeclarativeConnectorTemplate,
): DeclarativeConnectorSchemaContract | undefined {
    return packageState.reviewedSchemaBaselines?.find(
        (reviewed) =>
            reviewed.packageDigest === packageState.packageDigest &&
            connectorIdentity(reviewed.connector) === connectorIdentity(connector),
    )?.schema;
}

function connectorIdentity(connector: { provider: string; root?: string }): string {
    return `${connector.provider}:${connector.root ?? "."}`;
}
