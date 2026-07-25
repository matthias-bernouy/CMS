import type { IntegrationPackageEnvelopeV1, IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import {
    assertExactIntegrationVersion,
    parseIntegrationDefinition,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { hydrateSnapshotDefinitionAssets } from "../asset";
import { resolveIntegrationDefinitionEnvelopeValue } from "./definitionBundle";

export function loadIntegrationDefinitionFromPackageEnvelope(
    envelope: IntegrationPackageEnvelopeV1,
    limits: Readonly<IntegrationPackageLimits>,
): IntegrationDefinition {
    assertExactIntegrationVersion(envelope.version, "version");
    const value = resolveIntegrationDefinitionEnvelopeValue(envelope, limits);
    assertRawDefinitionVersion(value, envelope.version);
    const definition = parseIntegrationDefinition(value);
    if (definition.kind !== envelope.kind) {
        throw new Error(
            `definition.kind: definition kind "${definition.kind}" does not match package kind "${envelope.kind}"`,
        );
    }
    if (definition.version !== envelope.version) {
        throw new Error(
            `definition.version: definition version "${definition.version ?? ""}" does not match package version "${envelope.version}"`,
        );
    }
    return hydrateSnapshotDefinitionAssets(definition, envelope);
}

function assertRawDefinitionVersion(value: unknown, expectedVersion: string): void {
    const version =
        value && typeof value === "object" && !Array.isArray(value) && "version" in value ? value.version : undefined;
    if (version !== expectedVersion) {
        throw new Error(
            `definition.version: definition version "${typeof version === "string" ? version : ""}" does not match package version "${expectedVersion}"`,
        );
    }
}
