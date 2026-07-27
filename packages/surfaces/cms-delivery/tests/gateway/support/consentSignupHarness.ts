import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
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
    const functions = new InMemoryFunctionRepository();
    const triggers = new InMemoryTriggerRepository();
    const sourceOverlays = new InMemorySourceOverlayRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    const importedBlocs: IntegrationBlocArtifact[] = [];
    const definition = await consentDefinition();
    await seedBasicBlocs(installations);
    await runIntegrationInstallation({
        mode: "create",
        deps: {
            sources,
            secrets,
            roles,
            dashboards,
            functions,
            triggers,
            sourceOverlays,
            installations,
            connectorDeployers: [supabaseDeployer()],
            sourceExecutorDeps: { fetchImpl: backend.fetch, resolveSecret: createSecretResolver(secrets) },
            resolvePublishedPage: async (path) => ({
                id: path.slice(1),
                path,
                title: `Legal ${path}`,
                description: `Published ${path}`,
                content: `<main>${path}</main>`,
            }),
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        installations,
        siteIntegrations: [definition],
        dto: { kind: "consent", answers: consentAnswers(enabled), options: {} },
    });

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
    const bloc = importedBlocs.find((candidate) => candidate.tag === "cms-consent-field");
    if (!bloc) {
        throw new Error("the Consent installation did not import cms-consent-field");
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

async function consentDefinition(): Promise<IntegrationDefinition> {
    const value = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("consent");
    if (!value) {
        throw new Error("Consent integration definition not found");
    }
    return value;
}

function consentAnswers(enabled: boolean) {
    return {
        id: "consent",
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

async function seedBasicBlocs(installations: InMemoryIntegrationInstallationRepository): Promise<void> {
    await installations.create({
        id: "basic-blocs",
        label: "Basic Blocs",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "bloc", id: "basic-input", action: "created" }],
        runs: [],
    });
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
