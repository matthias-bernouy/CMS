import { parseIntegrationDefinition } from "../../core/parsing/definition/definition";
import { assertExactIntegrationVersion, isExactIntegrationVersion } from "../../core/definitions/versioning";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import { enrichDefinitionError } from "./definition-bundle/provenance";
import { resolveIntegrationDefinitionFileDetails } from "./definition-bundle/resolver";
import { hydrateVersionAssets } from "./versionAssets";

export type LoadIntegrationDefinitionFromVersionRootOptions = {
    definitionPath: string;
    expectedKind: string;
    expectedVersion: string;
    versionRoot: string;
};

export async function loadIntegrationDefinitionFromVersionRoot(
    options: LoadIntegrationDefinitionFromVersionRootOptions,
): Promise<IntegrationDefinition> {
    assertExactIntegrationVersion(options.expectedVersion, "version");
    const resolved = await resolveIntegrationDefinitionFileDetails(options.definitionPath, options.versionRoot);
    let definition: IntegrationDefinition;
    try {
        assertRawDefinitionVersion(resolved.value, options.expectedVersion);
        definition = parseIntegrationDefinition(resolved.value);
        assertDefinitionIdentity(definition, options.expectedKind, options.expectedVersion);
    } catch (error) {
        throw enrichDefinitionError(error, resolved.provenance, resolved.versionRoot);
    }
    return await hydrateVersionAssets(definition, resolved.versionRoot);
}

function assertDefinitionIdentity(
    definition: IntegrationDefinition,
    expectedKind: string,
    expectedVersion: string,
): void {
    if (definition.kind !== expectedKind) {
        throw new Error(
            `definition.kind: definition kind "${definition.kind}" does not match index kind "${expectedKind}"`,
        );
    }
    if (definition.version !== expectedVersion) {
        throw new Error(
            `definition.version: definition version "${definition.version ?? ""}" does not match index version "${expectedVersion}"`,
        );
    }
}

function assertRawDefinitionVersion(value: unknown, expectedVersion: string): void {
    const version =
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "version" in value &&
        typeof value.version === "string"
            ? value.version
            : "";
    if (!isExactIntegrationVersion(version) || version !== expectedVersion) {
        throw new Error(
            `definition.version: definition version "${version}" does not match index version "${expectedVersion}"`,
        );
    }
}
