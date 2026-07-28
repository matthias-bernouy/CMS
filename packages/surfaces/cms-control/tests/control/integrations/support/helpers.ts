import { InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryCache } from "@bernouy/http-runner";
import type {
    IntegrationDefinition,
    IntegrationDefinitionRepository,
    IntegrationInstallationRepository,
    IntegrationPackageResolver,
    ResolveIntegrationPackageRequest,
} from "@bernouy/cms-integrations";
export {
    TEST_SECRET_SOURCE_DEFINITION,
    manualSourceDefinition,
    sourceWithFunctionDefinition,
} from "./definitions";
import { TEST_SECRET_SOURCE_DEFINITION } from "./definitions";

export function makeCms(siteIntegrations: IntegrationDefinition[] = [TEST_SECRET_SOURCE_DEFINITION]) {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const dashboards = new InMemoryDashboardRepository();
    const relations = new InMemoryRelationRepository();
    const functions = new InMemoryFunctionRepository();
    const integrationInstallations = new InMemoryIntegrationInstallationRepository();
    const integrationCatalog = integrationDefinitionRepository(siteIntegrations);
    const cache = new InMemoryCache();
    const repository = {
        getBlocsList: async () => [],
    };
    const cms = {
        repository,
        sources,
        secrets,
        dashboards,
        relations,
        functions,
        integrationCatalog,
        integrationInstallations,
        cache,
    };
    return {
        cms: cms as any,
        repository,
        sources,
        secrets,
        dashboards,
        relations,
        functions,
        integrationInstallations,
        integrationCatalog,
        cache,
    };
}

export function integrationDefinitionRepository(definitions: IntegrationDefinition[]): IntegrationDefinitionRepository {
    return {
        list: async () =>
            definitions.map((definition) => ({
                kind: definition.kind,
                label: definition.label,
                ...(definition.version ? { stable: definition.version, latest: definition.version } : {}),
                versions: definition.version ? [definition.version] : [],
            })),
        getIndex: async (kind: string) => {
            const matching = definitions.filter(
                (definition): definition is IntegrationDefinition & { version: string } =>
                    definition.kind === kind && Boolean(definition.version),
            );
            const first = matching[0];
            if (!first) {
                return null;
            }
            const versions = matching.map((definition) => ({
                version: definition.version,
                path: `versions/${definition.version}`,
                definition: "integration.json",
            }));
            return {
                kind,
                label: first.label,
                stable: versions[0]?.version,
                latest: versions.at(-1)?.version,
                versions,
            };
        },
        listVersions: async (kind: string) =>
            definitions
                .filter(
                    (definition): definition is IntegrationDefinition & { version: string } =>
                        definition.kind === kind && Boolean(definition.version),
                )
                .map((definition) => ({
                    version: definition.version,
                    path: `versions/${definition.version}`,
                    definition: "integration.json",
                })),
        get: async (kind: string, version?: string) =>
            definitions.find(
                (definition) => definition.kind === kind && (!version || definition.version === version),
            ) ?? null,
    };
}

export function recordingPackageResolver(
    definitionForRequest: (request: ResolveIntegrationPackageRequest) => IntegrationDefinition = () =>
        TEST_SECRET_SOURCE_DEFINITION,
) {
    const requests: ResolveIntegrationPackageRequest[] = [];
    const resolver: IntegrationPackageResolver = {
        resolve: async (request) => {
            requests.push(request);
            return {
                root: `/integration-packages/${request.kind}/${request.version}`,
                kind: request.kind,
                version: request.version,
                digest: "a".repeat(64),
                definition: definitionForRequest(request),
            };
        },
    };
    return { resolver, requests };
}

export async function createInstallation(
    repository: IntegrationInstallationRepository,
    id: string,
    packageDigest?: string,
): Promise<void> {
    await repository.create({
        id,
        label: id,
        definitionVersion: "1.0.0",
        ...(packageDigest ? { packageDigest } : {}),
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
    });
}

export function postImport(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/integrations/import", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

export function getInstallations(id?: string) {
    const url = id
        ? `http://localhost/cms/api/integrations/installations?id=${encodeURIComponent(id)}`
        : "http://localhost/cms/api/integrations/installations";
    return new Request(url);
}

export function postRerun(id?: string, body?: Record<string, unknown>) {
    const query = id ? `?id=${encodeURIComponent(id)}` : "";
    return new Request(`http://localhost/cms/api/integrations/installations/rerun${query}`, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: body === undefined ? undefined : { "content-type": "application/json" },
    });
}

export function postUpgrade(id?: string, body?: Record<string, unknown>) {
    const query = id ? `?id=${encodeURIComponent(id)}` : "";
    return new Request(`http://localhost/cms/api/integrations/installations/upgrade${query}`, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: body === undefined ? undefined : { "content-type": "application/json" },
    });
}
