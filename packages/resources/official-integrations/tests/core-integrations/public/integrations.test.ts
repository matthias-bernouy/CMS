import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository, validateDashboard } from "@bernouy/cms-dashboards";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, validateSource } from "@bernouy/cms-sources";
import { stripeWebhookProvisioner } from "../../helpers/stripeWebhookProvisioner";

describe("public integrations 1.0.0", () => {
    test.each([
        {
            kind: "newsletter",
            sourceId: "newsletter",
            dashboardId: "newsletter-subscriptions",
            blocTags: ["newsletter-subscription"],
            answers: { id: "newsletter" },
            functionName: "cms-newsletter",
            schemas: ["newsletter"],
            expectedEndpoints: [
                "setSubscription",
                "listSubscriptions",
                "exportSubscriptions",
                "getSubscription",
                "deleteSubscription",
            ],
        },
        {
            kind: "emailer",
            sourceId: "emailer",
            dashboardId: "emailer-templates",
            blocTags: [],
            answers: { id: "emailer" },
            functionNames: ["cms-emailer", "cms-broadcast"],
            schemas: ["emailer", "broadcast"],
            expectedEndpoints: [
                "listTemplates",
                "getTemplate",
                "upsertTemplate",
                "sendTestEmail",
                "sendTemplateEmail",
                "installTemplates",
                "listMessages",
                "getSettings",
                "updateSettings",
            ],
        },
        {
            kind: "stripe-connect",
            sourceId: "stripe-connect",
            dashboardId: "stripe-connect-dashboard",
            blocTags: ["stripe-connect-onboarding"],
            answers: {
                id: "stripe-connect",
                stripeSecretKey: "sk_test_123",
                stripePublishableKey: "pk_test_123",
                defaultCountry: "FR",
                defaultCurrency: "eur",
                sellerActivityDescription: "Sale of second-hand goods between individuals.",
            },
            functionName: "cms-stripe-connect",
            schemas: ["stripe_connect"],
            expectedEndpoints: ["getConnectStatus", "createOnboardingSession", "listProviderPayments"],
            installsDashboard: false,
        },
        {
            kind: "user-account",
            sourceId: "user-account",
            dashboardId: "user-account-users",
            blocTags: ["user-account-avatar", "user-account-form"],
            answers: { id: "user-account" },
            functionName: "cms-user-account",
            schemas: ["user_account"],
            expectedEndpoints: ["getAccount", "updateAccount", "listAccounts", "createUserPersonalInformation"],
        },
        {
            kind: "sales-configurator",
            sourceId: "sales-configurator",
            dashboardId: "sales-configurator-catalog",
            blocTags: [
                "sales-client-directory",
                "sales-catalog-browser",
                "sales-proposal-list",
                "sales-proposal-starter",
                "sales-proposal-builder",
                "sales-proposal-view",
            ],
            answers: { id: "sales-configurator" },
            functionName: "cms-sales-configurator",
            schemas: ["sales_configurator"],
            expectedEndpoints: [
                "manageModules",
                "managePartners",
                "manageProposals",
                "getPartnerCatalog",
                "saveMyProposalDraft",
                "publishMyProposal",
                "getSharedProposal",
            ],
        },
        {
            kind: "photo-albums",
            sourceId: "photo-albums",
            dashboardId: "photo-albums",
            blocTags: ["photo-album-list", "photo-album-gallery"],
            answers: { id: "photo-albums" },
            functionName: "cms-photo-albums",
            schemas: ["photo_albums"],
            expectedEndpoints: [
                "albums",
                "album",
                "categories",
                "publicPhoto",
                "manageAlbums",
                "manageAlbum",
                "managePhoto",
                "updatePhoto",
                "uploadPhoto",
                "settings",
            ],
        },
    ])("installs $kind source, dashboard, connector, and blocs", async (scenario) => {
        const harness = await importScenario(scenario.kind, scenario.answers);
        const source = await harness.sources.getSource(`urn:${scenario.sourceId}`);
        const dashboard = await harness.dashboards.getDashboard(scenario.dashboardId);

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        if ("installsDashboard" in scenario && scenario.installsDashboard === false) {
            expect(dashboard).toBeNull();
        } else {
            expect(dashboard).toBeTruthy();
        }
        expect(harness.deployment?.dataApiSchemas).toEqual(scenario.schemas);
        expect(harness.deployment?.functions.map((fn) => fn.name)).toEqual(
            "functionNames" in scenario ? scenario.functionNames : [scenario.functionName],
        );
        expect(harness.importedBlocs.map((bloc) => bloc.tag)).toEqual(scenario.blocTags);

        const endpointUrns = source?.endpoints.map((endpoint) => endpoint.urn) ?? [];
        for (const endpoint of scenario.expectedEndpoints) {
            expect(endpointUrns).toContain(`urn:${scenario.sourceId}:${endpoint}`);
        }

        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).not.toContain('"widget":"w-create"');
        expect(dashboardJson).not.toContain('"widget":"w-update"');
        expect(dashboardJson).not.toContain('"widget":"w-delete"');
        expect(dashboardJson).not.toContain('"collection"');

        if (scenario.kind === "newsletter") {
            const table = dashboard?.views[0] as Record<string, unknown> | undefined;
            expect(dashboard?.views).toHaveLength(1);
            expect(table?.widget).toBe("w-table");
            expect(table?.selection).toBeUndefined();
            expect(dashboardJson).not.toContain("subscriptionDetail");
            expect(dashboardJson).not.toContain("createSubscription");
            expect(dashboardJson).toContain("exportSubscriptions");
            expect(dashboardJson).toContain("newsletter-subscriptions.csv");
        }
        if (scenario.kind === "emailer") {
            const settingsDashboard = await harness.dashboards.getDashboard("emailer-settings");
            expect(settingsDashboard).toBeTruthy();
            expect(validateDashboard(settingsDashboard!, { source })).toEqual([]);
            const settingsJson = JSON.stringify(settingsDashboard);
            expect(dashboardJson).toContain("newTemplate");
            expect(dashboardJson).toContain("sendTestEmail");
            expect(dashboardJson).not.toContain("messagesTable");
            expect(dashboardJson).toContain("textBody");
            expect(dashboardJson).toContain("sampleDataJson");
            expect(dashboardJson).toContain('"metadata":"$resource.metadata"');
            expect(settingsJson).toContain("emailerSettings");
            expect(settingsJson).toContain("getSettings");
            expect(settingsJson).toContain("saveSettings");
            expect(settingsJson).toContain("updateSettings");
        }
    });

    test("declares response outputs for every official endpoint", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const missing: string[] = [];

        for (const entry of await repo.list()) {
            const definition = await repo.get(entry.kind);
            for (const artifact of definition?.artifacts ?? []) {
                if (artifact.type !== "source") {
                    continue;
                }
                for (const endpoint of artifact.source.endpoints) {
                    if (endpoint.output?.length) {
                        continue;
                    }
                    missing.push(`${entry.kind}:${artifact.source.id}:${endpoint.endpointId}`);
                }
            }
        }

        expect(missing).toEqual([]);
    });
});

export async function importScenario(kind: string, answers: Record<string, string | boolean>) {
    const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const definition = await repo.get(kind);
    if (!definition) {
        throw new Error(`${kind} definition not found`);
    }

    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const sourceOverlays = new InMemorySourceOverlayRepository();
    const functions = new InMemoryFunctionRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
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
    if (kind === "emailer") {
        await secrets.set("NEWSLETTER_KEY", "newsletter-key");
        await sources.createSource(newsletterDependencySource());
        await installations.create({
            id: "newsletter",
            label: "Newsletter",
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: { id: "newsletter" },
            secretRefs: { cmsApiKey: "NEWSLETTER_KEY" },
            secretInputs: ["cmsApiKey"],
            artifacts: [{ type: "source", id: "urn:newsletter", action: "created" }],
            runs: [],
        });
    }
    const importedBlocs: IntegrationBlocArtifact[] = [];
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async previewOutputs() {
            return { functionsBaseUrl: "https://project.supabase.co/functions/v1" };
        },
        async deploy(next) {
            deployment = next;
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

    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            functions,
            sourceOverlays,
            installations,
            connectorDeployers: [deployer],
            provisioners: [stripeWebhookProvisioner()],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind, answers, options: {} },
        [definition as IntegrationDefinition],
    );

    return { result, sources, sourceOverlays, secrets, dashboards, importedBlocs, deployment };
}

function newsletterDependencySource() {
    return {
        urn: "urn:newsletter",
        meta: { name: "Newsletter" },
        endpoints: [
            {
                urn: "urn:newsletter:listSubscriptions",
                method: "GET" as const,
                targetUrl: "https://newsletter.test/subscriptions",
                input: {
                    params: [
                        { name: "subscribed", in: "query" as const, schema: { type: "string" as const } },
                        { name: "limit", in: "query" as const, schema: { type: "number" as const } },
                        { name: "offset", in: "query" as const, schema: { type: "number" as const } },
                    ],
                },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object" as const,
                            properties: {
                                subscriptions: {
                                    type: "array" as const,
                                    items: {
                                        type: "object" as const,
                                        properties: { email: { type: "string" as const } },
                                    },
                                },
                                total: { type: "number" as const },
                            },
                        },
                    },
                ],
            },
        ],
    };
}
