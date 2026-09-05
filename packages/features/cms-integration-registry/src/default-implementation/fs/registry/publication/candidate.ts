import type { IntegrationPackageLimits, ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { resolveIntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import {
    assertIntegrationBlocTagPublishable,
    assertSqlConnectorSchemaCompatibilityDeclared,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { loadIntegrationDefinitionFromPackageEnvelope } from "../../manifest/definition";
import {
    prepareIntegrationRegistryVersionManifest,
    type PreparedIntegrationRegistryVersionManifest,
} from "../../manifest/contract";
import { assertPackageAnonymousConstraintPolicy } from "./sqlConstraintPolicy";

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
    return prepareCandidate(input, limitOverrides);
}

async function prepareCandidate(
    input: ResolvedIntegrationPackage,
    limitOverrides: Partial<IntegrationPackageLimits> | undefined,
): Promise<PreparedFsIntegrationRegistryCandidate> {
    const limits = resolveIntegrationPackageLimits(limitOverrides);
    const manifest = await prepareIntegrationRegistryVersionManifest(input, limits);
    const definition = loadIntegrationDefinitionFromPackageEnvelope(manifest.package.envelope, limits);
    assertPublishableBlocTags(definition);
    assertPackageAnonymousConstraintPolicy(manifest.package);
    assertSqlConnectorSchemaCompatibilityDeclared(definition);
    return { package: manifest.package, definition, manifest, limits };
}

function assertPublishableBlocTags(definition: IntegrationDefinition): void {
    for (const [index, artifact] of (definition.artifacts ?? []).entries()) {
        if (artifact.type === "bloc") {
            assertIntegrationBlocTagPublishable(artifact.bloc.tag, `definition.artifacts.${index}.bloc.tag`);
        }
    }
}
