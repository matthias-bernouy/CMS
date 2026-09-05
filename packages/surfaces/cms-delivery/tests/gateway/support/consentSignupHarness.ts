import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { createSecretResolver, InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    CompositeSourceRepository,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SYSTEM_SOURCES,
} from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { CaptureRunner } from "./CaptureRunner";
import { consentAuthHarness } from "./consentAuthHarness";
import { ConsentBackend } from "./consentBackend";

export type ConsentSignupHarness = Awaited<ReturnType<typeof consentSignupHarness>>;

export async function consentSignupHarness(enabled = true) {
    const backend = new ConsentBackend();
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    const functions = new InMemoryFunctionRepository();
    const triggers = new InMemoryTriggerRepository();
    const sourceOverlays = new InMemorySourceOverlayRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    const importedBlocs: IntegrationBlocArtifact[] = [];
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const consent = await requiredDefinition(repository, "consent");
    const mossa = await requiredDefinition(repository, "mossa");
    const ulvia = await requiredDefinition(repository, "ulvia");
    const siteIntegrations = [consent, mossa, ulvia];
    const deps = {
        sources,
        secrets,
        roles,
        dashboards,
        dashboardViews,
        functions,
        triggers,
        sourceOverlays,
        installations,
        connectorDeployers: [supabaseDeployer()],
        sourceExecutorDeps: { fetchImpl: backend.fetch, resolveSecret: createSecretResolver(secrets) },
        resolvePublishedPage: async (path: string) => ({
            id: path.slice(1),
            path,
            title: `Legal ${path}`,
            description: `Published ${path}`,
            content: `<main>${path}</main>`,
        }),
        blocs: {
            async importBloc(artifact: IntegrationBlocArtifact) {
                importedBlocs.push(artifact);
                return { id: artifact.tag, action: "created" as const };
            },
        },
    };
    await runIntegrationInstallation({
        mode: "create",
        deps,
        installations,
        siteIntegrations,
        dto: { kind: "consent", answers: { id: "consent", contextKey: "signup" }, options: {} },
    });
    await runIntegrationInstallation({
        mode: "create",
        deps,
        installations,
        siteIntegrations,
        dto: {
            kind: "mossa",
            answers: {},
            options: {},
            resources: ["mossa/blocs/consent-field"],
        },
    });
    backend.configure(consentConfiguration(enabled));

    const runner = new CaptureRunner();
    const { auth, users, credentials, emailer } = consentAuthHarness();
    new DeliveryCms({
        runner,
        repository: {} as never,
        auth,
        sources: new CompositeSourceRepository(sources, SYSTEM_SOURCES),
        roles,
        functions,
        triggers,
        sourceResolveSecret: createSecretResolver(secrets),
    });
    const bloc = importedBlocs.find((candidate) => candidate.tag === "mossa-consent-field");
    if (!bloc) {
        throw new Error("the Mossa installation did not import mossa-consent-field");
    }
    return {
        backend,
        bloc,
        credentials,
        emailer,
        users,
        triggers,
        get: runner.defaultHandler("GET", "/.cms/sources"),
        post: runner.defaultHandler("POST", "/.cms/sources"),
    };
}

async function requiredDefinition(
    repository: FsIntegrationDefinitionRepository,
    kind: string,
): Promise<IntegrationDefinition> {
    const value = await repository.get(kind);
    if (!value) {
        throw new Error(`${kind} integration definition not found`);
    }
    return value;
}

function consentConfiguration(enabled: boolean) {
    return {
        enabled,
        contextKey: "signup",
        documents: enabled
            ? [
                  { enabled: true, key: "terms", label: "Terms", consentText: "I accept the Terms.", page: "/terms" },
                  {
                      enabled: true,
                      key: "privacy",
                      label: "Privacy",
                      consentText: "I accept Privacy.",
                      page: "/privacy",
                  },
              ]
            : [],
    };
}

function supabaseDeployer(): IntegrationConnectorDeployer {
    return {
        provider: "supabase",
        async previewOutputs() {
            return { functionsBaseUrl: "https://project.supabase.co/functions/v1" };
        },
        async deploy(next) {
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                resources: [
                    { type: "schema", id: "sql/schema.manifest.json", action: "applied" },
                    ...(next.functions ?? []).map((fn) => ({
                        type: "function" as const,
                        id: fn.name,
                        action: "deployed" as const,
                    })),
                ],
            };
        },
    };
}
