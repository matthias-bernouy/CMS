import type { IntegrationPackageLimits, ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { resolveIntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import { assertSqlConnectorSchemaCompatibilityDeclared, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { loadIntegrationDefinitionFromPackageEnvelope } from "../../manifest/definition";
import {
    prepareIntegrationRegistryVersionManifest,
    type PreparedIntegrationRegistryVersionManifest,
} from "../../manifest/contract";

export type PreparedFsIntegrationRegistryCandidate = Readonly<{
    package: ResolvedIntegrationPackage;
    definition: IntegrationDefinition;
    manifest: PreparedIntegrationRegistryVersionManifest;
    limits: Readonly<IntegrationPackageLimits>;
}>;

export async function prepareFsIntegrationRegistryCandidate(
    input: ResolvedIntegrationPackage,
    limitOverrides?: Partial<IntegrationPackageLimits>,
): Promise<PreparedFsIntegrationRegistryCandidate> {
    const limits = resolveIntegrationPackageLimits(limitOverrides);
    const manifest = await prepareIntegrationRegistryVersionManifest(input, limits);
    const definition = loadIntegrationDefinitionFromPackageEnvelope(manifest.package.envelope, limits);
    assertSqlConnectorSchemaCompatibilityDeclared(definition);
    return { package: manifest.package, definition, manifest, limits };
}
