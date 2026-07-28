import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

export type CleanupRepositories = {
    sources: InMemorySourceRepository;
    functions: InMemoryFunctionRepository;
    secrets: InMemorySecretStore;
    installations: InMemoryIntegrationInstallationRepository;
};

export function install(definition: IntegrationDefinition, repositories: CleanupRepositories) {
    return runIntegrationInstallation({
        mode: "create",
        deps: {
            sources: repositories.sources,
            functions: repositories.functions,
            secrets: repositories.secrets,
        },
        installations: repositories.installations,
        siteIntegrations: [definition],
        dto: { kind: definition.kind, answers: {}, options: {} },
    });
}

export function upgrade(definition: IntegrationDefinition, repositories: CleanupRepositories) {
    return runIntegrationInstallation({
        mode: "upgrade",
        deps: {
            sources: repositories.sources,
            functions: repositories.functions,
            secrets: repositories.secrets,
        },
        installations: repositories.installations,
        integrationId: definition.kind,
        targetDefinition: definition,
    });
}
