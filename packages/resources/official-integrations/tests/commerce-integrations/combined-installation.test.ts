import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
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

const kinds = [
    "basic-blocs",
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
            roles: new InMemoryRolesRepository(),
            relations: new InMemoryRelationRepository(),
            secrets: new InMemorySecretStore(),
            installations,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    return { id: artifact.tag, action: "created" };
                },
            },
        };

        await install("basic-blocs", {}, definitions, deps, installations);
        await install("user-account", { id: "accounts" }, definitions, deps, installations);
        await install("commerce", { id: "commerce" }, definitions, deps, installations);
        await install("mondial-relay", mondialRelayAnswers(), definitions, deps, installations);
        await install("stripe-connect", stripeAnswers(), definitions, deps, installations);
        await install("commerce-mondial-relay-delivery", {}, definitions, deps, installations);
        await install("commerce-mondial-relay-fulfillment", {}, definitions, deps, installations);
        await install(
            "commerce-stripe-payments",
            {
                sellerTermsVersion: "seller-terms-2026-07-13",
                sellerTermsHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
        stripeWebhookSecret: "whsec_combined_delivery",
        stripeConnectWebhookSecret: "whsec_connect_combined_delivery",
        stripeConnectV2WebhookSecret: "whsec_connect_v2_combined_delivery",
        defaultCountry: "FR",
        defaultCurrency: "eur",
        sellerActivityDescription: "Second-hand marketplace delivery integration tests.",
    };
}
