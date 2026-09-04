import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationAnswerValue,
    type IntegrationConnectorDeployer,
    type IntegrationDefinition,
    type IntegrationImportDeps,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, validateSource } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository, validateTrigger } from "@bernouy/cms-triggers";
import { stripeWebhookProvisioner } from "../helpers/stripeWebhookProvisioner";

const kinds = [
    "user-account",
    "commerce",
    "mondial-relay",
    "stripe-connect",
    "commerce-mondial-relay-delivery",
    "commerce-mondial-relay-fulfillment",
    "commerce-stripe-payments",
] as const;

describe("Commerce protected Mondial Relay and Stripe combined installation", () => {
    test("installs the complete real graph with compatible immutable quote contracts", async () => {
        const definitions = await definitionsForGraph();
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const triggers = new InMemoryTriggerRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        const deployments: string[] = [];
        const deployer: IntegrationConnectorDeployer = {
            provider: "supabase",
            async previewOutputs() {
                return { functionsBaseUrl: "https://combined.test/functions/v1" };
            },
            async deploy(deployment) {
                deployments.push(deployment.integrationKind);
                return { provider: "supabase", outputs: { functionsBaseUrl: "https://combined.test/functions/v1" } };
            },
        };
        const deps: IntegrationImportDeps = {
            sources,
            sourceOverlays: new InMemorySourceOverlayRepository(),
            functions,
            triggers,
            dashboards: new InMemoryDashboardRepository(),
            dashboardViews: new InMemoryDashboardViewRepository(),
            roles: new InMemoryRolesRepository(),
            relations: new InMemoryRelationRepository(),
            secrets: new InMemorySecretStore(),
            installations,
            connectorDeployers: [deployer],
            provisioners: [stripeWebhookProvisioner()],
            sourceExecutorDeps: {
                fetchImpl: async (input) => afterInstallationResponse(new Request(input)),
                resolveSecret: async () => "combined-install-cms-api-key",
            },
            blocs: {
                async importBloc(artifact) {
                    return { id: artifact.tag, action: "created" };
                },
            },
        };

        await install("user-account", { id: "accounts" }, definitions, deps, installations);
        await install(
            "commerce",
            {
                id: "commerce",
                buyerLegalEnabled: false,
                buyerLegalDocuments: [],
            },
            definitions,
            deps,
            installations,
        );
        await install("mondial-relay", mondialRelayAnswers(), definitions, deps, installations);
        await install("stripe-connect", stripeAnswers(), definitions, deps, installations);
        await install("commerce-mondial-relay-delivery", {}, definitions, deps, installations);
        await install("commerce-mondial-relay-fulfillment", {}, definitions, deps, installations);
        await install(
            "commerce-stripe-payments",
            {
                sellerTermsVersion: "seller-terms-2026-07-13",
                sellerTermsHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                sellerPayoutSchedule: "daily",
            },
            definitions,
            deps,
            installations,
        );

        expect(deployments).toEqual(["user-account", "commerce", "mondial-relay", "stripe-connect"]);
        expect((await sources.getAllSources()).map((source) => source.urn).sort()).toEqual([
            "urn:accounts",
            "urn:commerce",
            "urn:delivery",
            "urn:stripe-connect",
        ]);
        for (const source of await sources.getAllSources()) {
            expect(validateSource(source)).toEqual([]);
        }

        const functionIds = (await functions.getAllFunctions()).map((fn) => fn.id);
        expect(functionIds).toEqual(
            expect.arrayContaining([
                "setRelayPointForOrder",
                "getRelayPointForOrder",
                "createShipmentForMySale",
                "createClaimReturnShipmentForMyPurchase",
                "reconcileMondialRelayFulfillments",
                "createPaymentForOrder",
                "reconcileProtectedPaymentSystems",
            ]),
        );
        for (const fn of await functions.getAllFunctions()) {
            expect(await validateFunction(fn, { sources })).toEqual([]);
        }
        for (const trigger of await triggers.getAllTriggers()) {
            expect(validateTrigger(trigger)).toEqual([]);
        }
        const schedules = (await triggers.getAllTriggers())
            .filter((trigger) => trigger.event.kind === "schedule")
            .map((trigger) => ({
                id: trigger.id,
                intervalMs: trigger.event.kind === "schedule" ? trigger.event.intervalMs : 0,
                target: trigger.function?.id ?? trigger.task?.id,
                body: trigger.function?.body ?? trigger.task?.body,
            }));
        expect(schedules).toEqual(
            expect.arrayContaining([
                {
                    id: "schedule-dispatch-commerce-notifications",
                    intervalMs: 30_000,
                    target: "cms.notifications.dispatch",
                    body: { notificationKind: "commerce", emailerKind: "emailer", limit: 10 },
                },
                {
                    id: "schedule-reconcile-mondial-relay-shipment-operations",
                    intervalMs: 60_000,
                    target: "reconcileMondialRelayShipmentOperations",
                    body: { runKey: "$schedule.runKey", limit: 5 },
                },
                {
                    id: "schedule-reconcile-mondial-relay-fulfillments",
                    intervalMs: 300_000,
                    target: "reconcileMondialRelayFulfillments",
                    body: { runKey: "$schedule.runKey", limit: 8 },
                },
                {
                    id: "schedule-publish-mondial-relay-delivery-health",
                    intervalMs: 60_000,
                    target: "publishMondialRelayDeliveryHealth",
                    body: { runKey: "$schedule.runKey", limit: 24 },
                },
            ]),
        );
        expect(schedules).toHaveLength(9);
        for (const kind of kinds) {
            expect((await installations.get(kind))?.status).toBe("success");
        }

        const deliveryLink = definitions.find((definition) => definition.kind === "commerce-mondial-relay-delivery");
        const fulfillmentLink = definitions.find(
            (definition) => definition.kind === "commerce-mondial-relay-fulfillment",
        );
        const serialized = JSON.stringify([deliveryLink, fulfillmentLink]);
        expect(serialized).toContain("lockOrderFinancialTerms");
        expect(serialized).toContain("resolveDeliveryQuote");
        expect(serialized).toContain("deliveryQuoteId");
        expect(serialized).toContain("declaredValueMinorAmount");
        expect(serialized).not.toContain("applyDeliveryQuoteToMyOrder");
    }, 60_000);
});

function afterInstallationResponse(request: Request): Response {
    if (request.url.includes("/cms-stripe-connect/configuration/marketplace-terms")) {
        return Response.json({
            mode: "legacy",
            version: "seller-terms-2026-07-13",
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        });
    }
    if (request.url.includes("/cms-stripe-connect-management/seller-capabilities")) {
        return Response.json({
            readySellerCmsUserIds: [],
            snapshot: "seller-capabilities:test-empty",
            snapshotAt: "2026-07-23T12:00:00.000Z",
        });
    }
    if (request.url.includes("/cms-commerce/system/buyer-legal-documents/sync")) {
        return Response.json({ enabled: false, documents: [] });
    }
    if (request.url.includes("/cms-commerce/system/seller/sale-capability/activate")) {
        return Response.json({
            capabilityKey: "protected_payment",
            sellerKind: "user",
            enabled: true,
            readyCount: 0,
            notReadyCount: 0,
        });
    }
    return Response.json({ error: `unexpected after-installation request: ${request.url}` }, { status: 500 });
}

async function definitionsForGraph(): Promise<IntegrationDefinition[]> {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    return await Promise.all(
        kinds.map(async (kind) => {
            const definition = await repository.get(kind);
            if (!definition) {
                throw new Error(`${kind} definition not found`);
            }
            return definition;
        }),
    );
}

async function install(
    kind: (typeof kinds)[number],
    answers: Record<string, IntegrationAnswerValue>,
    definitions: IntegrationDefinition[],
    deps: IntegrationImportDeps,
    installations: InMemoryIntegrationInstallationRepository,
) {
    return await runIntegrationInstallation({
        mode: "create",
        deps,
        installations,
        siteIntegrations: definitions,
        dto: { kind, answers, options: {} },
    });
}

function mondialRelayAnswers(): Record<string, string> {
    return {
        id: "delivery",
        mondialRelayConnectEndpoint: "https://connect-api-sandbox.mondialrelay.com/api/shipment",
        mondialRelayConnectLogin: "combined-login",
        mondialRelayConnectPassword: "combined-password",
        mondialRelayConnectCustomerId: "TTMRSDBX",
        mondialRelayTrackingEndpoint: "https://api.mondialrelay.com/WebService.asmx",
        mondialRelayTrackingBrand: "BDTEST",
        mondialRelayTrackingPrivateKey: "combined-tracking-key",
    };
}

function stripeAnswers(): Record<string, string> {
    return {
        id: "stripe-connect",
        stripeSecretKey: "sk_test_combined_delivery",
        stripePublishableKey: "pk_test_combined_delivery",
        defaultCountry: "FR",
        defaultCurrency: "eur",
        sellerActivityDescription: "Second-hand marketplace delivery integration tests.",
    };
}
