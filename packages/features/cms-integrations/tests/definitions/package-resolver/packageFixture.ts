import {
    canonicalJsonBytes,
    sha256Hex,
    validateIntegrationPackageEnvelope,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition, ResolveIntegrationPackageRequest } from "@bernouy/cms-integrations";

export type ResolverPackageFixture = {
    package: ResolvedIntegrationPackage;
    definition: IntegrationDefinition;
};

export async function resolverPackageFixture(
    options: {
        kind?: string;
        version?: string;
        label?: string;
        description?: string;
        inputs?: IntegrationDefinition["inputs"];
    } = {},
): Promise<ResolverPackageFixture> {
    const kind = options.kind ?? "resolver-demo";
    const version = options.version ?? "1.2.3";
    const definition: IntegrationDefinition = {
        kind,
        label: options.label ?? "Resolver demo",
        version,
        inputs: options.inputs ?? [],
        ...(options.description ? { description: options.description } : {}),
    };
    const envelope = validateIntegrationPackageEnvelope({
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": {
                encoding: "utf8",
                content: `${JSON.stringify({ schema: "cms.integration.definition.v1", ...definition }, null, 4)}\n`,
            },
            "release-notes.md": { encoding: "utf8", content: `# ${definition.label}\n` },
        },
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    return {
        definition,
        package: {
            envelope,
            canonicalBytes,
            digest: await sha256Hex(canonicalBytes),
        },
    };
}

export function resolutionRequest(
    fixture: ResolverPackageFixture,
    overrides: Partial<ResolveIntegrationPackageRequest> = {},
): ResolveIntegrationPackageRequest {
    return {
        kind: fixture.package.envelope.kind,
        version: fixture.package.envelope.version,
        reason: "create",
        allowEmbeddedFallback: false,
        ...overrides,
    };
}
