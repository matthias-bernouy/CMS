import { randomUUID } from "node:crypto";
import type { IntegrationDefinition } from "../../../../interfaces/Integration";
import type { IntegrationImportResult } from "../../../../interfaces/IntegrationImport";
import type { IntegrationConnectorBinding } from "../../../../interfaces/IntegrationInstallation";

export function connectorRuntimeTargetsFromResult(definition: IntegrationDefinition, result: IntegrationImportResult) {
    return (result.connectors ?? []).flatMap((connector, index) =>
        definition.connectors?.[index]?.migration
            ? []
            : [{ provider: connector.provider, outputs: { ...(connector.outputs ?? {}) } }],
    );
}

export function connectorInstanceIds(
    definition: IntegrationDefinition,
    existing: Record<string, IntegrationConnectorBinding> = {},
): Record<string, string> {
    return Object.fromEntries(
        (definition.connectors ?? [])
            .filter((connector) => connector.migration && connector.connectorKey)
            .map((connector) => [
                connector.connectorKey as string,
                existing[connector.connectorKey as string]?.connectorInstanceId ?? randomUUID(),
            ]),
    );
}

export function connectorBindingsFromResult(
    definition: IntegrationDefinition,
    result: IntegrationImportResult,
    instanceIds: Record<string, string>,
    existing: Record<string, IntegrationConnectorBinding> = {},
): Record<string, IntegrationConnectorBinding> {
    const bindings = structuredClone(existing);
    for (const connector of definition.connectors ?? []) {
        if (
            !connector.migration ||
            !connector.connectorKey ||
            !connector.lineageId ||
            connector.migrationRevision === undefined
        ) {
            continue;
        }
        const connectorResult = result.connectors?.find((entry) => entry.connectorKey === connector.connectorKey);
        bindings[connector.connectorKey] = {
            connectorKey: connector.connectorKey,
            provider: connector.provider,
            lineageId: connector.lineageId,
            connectorInstanceId:
                connectorResult?.connectorInstanceId ??
                instanceIds[connector.connectorKey] ??
                existing[connector.connectorKey]?.connectorInstanceId ??
                randomUUID(),
            migrationRevision: connector.migrationRevision,
            outputs: { ...(existing[connector.connectorKey]?.outputs ?? {}), ...(connectorResult?.outputs ?? {}) },
        };
    }
    return bindings;
}
