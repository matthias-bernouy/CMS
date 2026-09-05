import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import {
    InMemoryDashboardRepository,
    InMemoryDashboardViewRepository,
    dashboardViewAsLegacyDashboard,
    validateDashboard,
} from "@bernouy/cms-dashboards";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, validateSource, type Source } from "@bernouy/cms-sources";

describe("commerce negotiation 1.0.0", () => {
    test("installs its Commerce-backed source and connector", async () => {
        const sources = new InMemorySourceRepository();
        const dashboards = new InMemoryDashboardRepository();
        const dashboardViews = new InMemoryDashboardViewRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const functions = new InMemoryFunctionRepository();
        await secrets.set("COMMERCE_KEY", "commerce-private-key");
        await sources.createSource(commerceSource());
        await installations.create({
            id: "commerce",
            label: "Commerce",
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: { id: "commerce" },
            secretRefs: { cmsApiKey: "COMMERCE_KEY" },
            secretInputs: ["cmsApiKey"],
            artifacts: [{ type: "source", id: "urn:commerce", action: "created" }],
            runs: [],
        });

        let deployment: IntegrationConnectorDeployment | undefined;
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async deploy(next) {
                deployment = next;
                return {
                    provider: "supabase",
                    outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                    resources: [
                        { type: "schema", id: "sql/schema.manifest.json", action: "applied" },
                        { type: "function", id: "cms-commerce-negotiation", action: "deployed" },
                    ],
                };
            },
        };
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
            "commerce-negotiation",
        );
        if (!definition) {
            throw new Error("commerce-negotiation definition not found");
        }

        const result = await importIntegration(
            {
                sources,
                dashboards,
                dashboardViews,
                secrets,
                functions,
                installations,
                roles: new InMemoryRolesRepository(),
                connectorDeployers: [deployer],
            },
            {
                kind: "commerce-negotiation",
                answers: { id: "commerce-negotiation" },
                options: {},
            },
            [definition],
        );

        const source = await sources.getSource("urn:commerce-negotiation");
        const proposalsView = await dashboardViews.getView("commerce-negotiation-proposals");
        const settingsView = await dashboardViews.getView("commerce-negotiation-settings");
        const proposals = proposalsView ? dashboardViewAsLegacyDashboard(proposalsView) : null;
        const settings = settingsView ? dashboardViewAsLegacyDashboard(settingsView) : null;
        expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
            "source",
            "function",
            "function",
            "dashboard-view",
            "dashboard-view",
            "dashboard",
        ]);
        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(proposals).toBeTruthy();
        expect(settings).toBeTruthy();
        expect(validateDashboard(proposals!, { source })).toEqual([]);
        expect(validateDashboard(settings!, { source })).toEqual([]);
        expect((await dashboards.getAllDashboards()).map((dashboard) => dashboard.id)).toEqual([
            "commerce-negotiation",
        ]);
        const settingsDetail = settings?.views.find((view) => view.id === "negotiationSettings");
        if (settingsDetail?.widget !== "w-detail") {
            throw new Error("negotiation settings detail not installed");
        }
        expect(settingsDetail.actions?.find((action) => action.id === "saveSettings")?.after).toEqual({
            resource: "$result",
        });
        expect(deployment?.dataApiSchemas).toEqual(["commerce_negotiation"]);
        expect(deployment?.functions[0]?.name).toBe("cms-commerce-negotiation");
        expect(deployment?.functions[0]?.secrets).not.toHaveProperty("CMS_COMMERCE_API_KEY");
        expect(deployment?.functions[0]?.secrets.CMS_NEGOTIATION_API_KEY).toStartWith("cms_cn_");
        const policyFunction = await functions.getFunction("getProposalPolicy");
        const createFunction = await functions.getFunction("createMyProposal");
        expect(policyFunction).toBeTruthy();
        expect(createFunction).toBeTruthy();
        expect(await validateFunction(policyFunction!, { sources })).toEqual([]);
        expect(await validateFunction(createFunction!, { sources })).toEqual([]);
        expect(policyFunction?.steps).toMatchObject([
            { call: { source: "commerce", endpoint: "getOfferNegotiationContext" } },
            { call: { source: "commerce-negotiation", endpoint: "getProposalPolicy" } },
        ]);
        expect(createFunction?.steps).toMatchObject([
            { call: { source: "commerce", endpoint: "getOfferNegotiationContext" } },
            { call: { source: "commerce-negotiation", endpoint: "createMyProposal" } },
        ]);
        expect(source?.endpoints.find((endpoint) => endpoint.urn.endsWith(":getProposalPolicy"))?.access).toEqual({
            mode: "system",
        });
        expect(source?.endpoints.find((endpoint) => endpoint.urn.endsWith(":createMyProposal"))?.access).toEqual({
            mode: "system",
        });
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).toEqual(
            expect.arrayContaining([
                "urn:commerce-negotiation:getProposalPolicy",
                "urn:commerce-negotiation:createMyProposal",
                "urn:commerce-negotiation:respondToProposal",
                "urn:commerce-negotiation:updateSettings",
            ]),
        );
    });

    test("uses the CMS-orchestrated Commerce snapshot without reading Commerce credentials", async () => {
        const realDeno = (globalThis as { Deno?: unknown }).Deno;
        const realFetch = globalThis.fetch;
        let handler: ((request: Request) => Promise<Response>) | undefined;
        const requests: Request[] = [];
        let settingsRow = {
            id: "default",
            minimum_ratio_bps: 8000,
            maximum_ratio_bps: 12000,
            proposal_ttl_hours: 72,
            accepted_checkout_ttl_hours: 24,
            enabled: true,
            version: 1,
            created_at: "2026-07-12T00:00:00Z",
            updated_at: "2026-07-12T00:00:00Z",
        };
        const environment: Record<string, string> = {
            CMS_NEGOTIATION_API_KEY: "negotiation-key",
            SUPABASE_URL: "https://project.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        };
        (
            globalThis as {
                Deno?: { env: { get: (name: string) => string | undefined }; serve: (handler: unknown) => unknown };
            }
        ).Deno = {
            env: { get: (name) => environment[name] },
            serve(value) {
                handler = value as (request: Request) => Promise<Response>;
                return {
                    shutdown() {
                        /* test stub */
                    },
                };
            },
        };
        globalThis.fetch = async (input, init) => {
            const request = input instanceof Request ? input : new Request(input, init);
            requests.push(request);
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rest/v1/rpc/expire_pending_proposals")) {
                expect(await request.json()).toEqual({});
                return Response.json(0);
            }
            if (url.pathname.endsWith("/rest/v1/settings")) {
                expect(request.headers.get("apikey")).toBe("service-role-key");
                expect(request.headers.get("accept-profile")).toBe("commerce_negotiation");
                if (request.method === "PATCH") {
                    expect(url.searchParams.get("id")).toBe("eq.default");
                    expect(url.searchParams.get("version")).toBe("eq.1");
                    expect(await request.json()).toEqual({
                        minimum_ratio_bps: 8500,
                        maximum_ratio_bps: 11500,
                        proposal_ttl_hours: 48,
                        enabled: false,
                    });
                    settingsRow = {
                        ...settingsRow,
                        minimum_ratio_bps: 8500,
                        maximum_ratio_bps: 11500,
                        proposal_ttl_hours: 48,
                        enabled: false,
                        version: 2,
                        updated_at: "2026-07-12T01:00:00Z",
                    };
                }
                return Response.json([settingsRow]);
            }
            if (url.pathname.endsWith("/rest/v1/rpc/list_participant_proposals")) {
                expect(await request.json()).toEqual({
                    p_user_id: "buyer-user",
                    p_role: "buyer",
                    p_status: "pending",
                    p_offer_id: 42,
                    p_limit: 1,
                    p_offset: 0,
                });
                return Response.json({ items: [], total: 0 });
            }
            return new Response("not found", { status: 404 });
        };
        try {
            await import("../connectors/supabase/functions/cms-commerce-negotiation/index.ts");
            expect(handler).toBeTruthy();
            const policyUrl = new URL("https://project.supabase.co/functions/v1/cms-commerce-negotiation/policy");
            for (const [name, value] of Object.entries({
                offerId: "42",
                offerSlug: "smoke-racket",
                offerTitle: "Smoke racket",
                sellerCmsUserId: "seller-user",
                sellerDisplayName: "Seller",
                referenceAmount: "10000",
                currency: "EUR",
                publicationStatus: "active",
                availability: "available",
                wholeUnitPrices: "true",
            })) {
                policyUrl.searchParams.set(name, value);
            }
            const response = await handler!(
                new Request(policyUrl, {
                    headers: { authorization: "Bearer negotiation-key", "x-cms-user-id": "buyer-user" },
                }),
            );
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                enabled: true,
                canPropose: true,
                offerId: 42,
                referenceAmount: 10000,
                minimumAmount: 8000,
                maximumAmount: 12000,
                currency: "eur",
                wholeUnitPrices: true,
                expiresAfterHours: 72,
            });
            const ownOfferResponse = await handler!(
                new Request(policyUrl, {
                    headers: { authorization: "Bearer negotiation-key", "x-cms-user-id": "seller-user" },
                }),
            );
            expect(ownOfferResponse.status).toBe(200);
            expect(await ownOfferResponse.json()).toEqual({
                enabled: true,
                canPropose: false,
                ineligibilityReason: "own_offer",
                offerId: 42,
                referenceAmount: 10000,
                minimumAmount: 8000,
                maximumAmount: 12000,
                currency: "eur",
                wholeUnitPrices: true,
                expiresAfterHours: 72,
            });
            const proposalsResponse = await handler!(
                new Request(
                    "https://project.supabase.co/functions/v1/cms-commerce-negotiation/proposals?role=buyer&status=pending&offerId=42&limit=1",
                    { headers: { authorization: "Bearer negotiation-key", "x-cms-user-id": "buyer-user" } },
                ),
            );
            expect(proposalsResponse.status).toBe(200);
            expect(await proposalsResponse.json()).toEqual({ items: [], total: 0 });
            const updatedSettingsResponse = await handler!(
                new Request("https://project.supabase.co/functions/v1/cms-commerce-negotiation/admin/settings", {
                    method: "POST",
                    headers: { authorization: "Bearer negotiation-key", "content-type": "application/json" },
                    body: JSON.stringify({
                        expectedVersion: 1,
                        minimumPercent: 85,
                        maximumPercent: 115,
                        proposalTtlHours: 48,
                        enabled: false,
                    }),
                }),
            );
            const fetchedSettingsResponse = await handler!(
                new Request("https://project.supabase.co/functions/v1/cms-commerce-negotiation/admin/settings", {
                    headers: { authorization: "Bearer negotiation-key" },
                }),
            );
            expect(updatedSettingsResponse.status).toBe(200);
            expect(fetchedSettingsResponse.status).toBe(200);
            const updatedSettings = await updatedSettingsResponse.json();
            const fetchedSettings = await fetchedSettingsResponse.json();
            expect(updatedSettings).toEqual({
                minimumPercent: 85,
                maximumPercent: 115,
                proposalTtlHours: 48,
                acceptedCheckoutTtlHours: 24,
                enabled: false,
                version: 2,
                createdAt: "2026-07-12T00:00:00Z",
                updatedAt: "2026-07-12T01:00:00Z",
            });
            expect(fetchedSettings).toEqual(updatedSettings);
        } finally {
            (globalThis as { Deno?: unknown }).Deno = realDeno;
            globalThis.fetch = realFetch;
        }
        expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
            "/rest/v1/rpc/expire_pending_proposals",
            "/rest/v1/settings",
            "/rest/v1/rpc/expire_pending_proposals",
            "/rest/v1/settings",
            "/rest/v1/rpc/list_participant_proposals",
            "/rest/v1/settings",
            "/rest/v1/settings",
        ]);
        expect(requests.every((request) => !new URL(request.url).pathname.includes("/cms-commerce/"))).toBe(true);
    });
});

function commerceSource(): Source {
    return {
        urn: "urn:commerce",
        meta: { name: "Commerce" },
        endpoints: [
            {
                urn: "urn:commerce:getOfferNegotiationContext",
                method: "GET",
                access: { mode: "system" },
                targetUrl: "https://commerce.test/system/offer/negotiation-context",
                input: {
                    params: [
                        {
                            name: "offerId",
                            in: "query",
                            required: true,
                            schema: { type: "number" },
                        },
                    ],
                },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: {
                                offerId: { type: "number" },
                                offerSlug: { type: "string" },
                                offerTitle: { type: "string" },
                                offerMainImageMediaId: { type: "number", nullable: true },
                                offerMainImageWidth: { type: "number", nullable: true },
                                offerMainImageHeight: { type: "number", nullable: true },
                                sellerCmsUserId: { type: "string", nullable: true },
                                sellerDisplayName: { type: "string" },
                                referenceAmount: { type: "number", nullable: true },
                                currency: { type: "string" },
                                publicationStatus: { type: "string" },
                                availability: { type: "string" },
                                wholeUnitPrices: { type: "boolean" },
                            },
                            required: [
                                "offerId",
                                "offerSlug",
                                "offerTitle",
                                "offerMainImageMediaId",
                                "offerMainImageWidth",
                                "offerMainImageHeight",
                                "sellerCmsUserId",
                                "sellerDisplayName",
                                "referenceAmount",
                                "currency",
                                "wholeUnitPrices",
                                "publicationStatus",
                                "availability",
                            ],
                        },
                    },
                    ...[400, 404].map((status) => ({
                        status: String(status),
                        body: {
                            type: "object" as const,
                            properties: { error: { type: "string" as const } },
                            required: ["error"],
                        },
                    })),
                ],
            },
        ],
    };
}
