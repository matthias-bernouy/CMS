import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { ADMIN_ROLE, InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    applySourceOverlays,
    executeEndpoint,
    handleSourceRequest,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    projectStrictDataShape,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
} from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { expectedEndpointUrns } from "./expectations";
import { connectorDeployer } from "./setup";
import { installCommerceTestEnvironment, supabaseUrl } from "../../harness";
installCommerceTestEnvironment();
describe("commerce 3.0.0 contract", () => {
    test("loads and imports the official Commerce contract", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const catalog = await repository.list();
        const definition = await repository.get("commerce");
        if (!definition) {
            throw new Error("commerce definition not found");
        }
        const sources = new InMemorySourceRepository(),
            sourceOverlays = new InMemorySourceOverlayRepository();
        const dashboards = new InMemoryDashboardRepository();
        const triggers = new InMemoryTriggerRepository();
        const secrets = new InMemorySecretStore(),
            roles = new InMemoryRolesRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        let deployment: IntegrationConnectorDeployment | undefined;
        const deployer = connectorDeployer((value) => {
            deployment = value;
        });
        const result = await importIntegration(
            {
                sources,
                sourceOverlays,
                dashboards,
                secrets,
                roles,
                installations,
                triggers,
                connectorDeployers: [deployer],
            },
            { kind: "commerce", answers: { id: "commerce" }, options: {} },
            [definition],
        );
        const source = await sources.getSource("urn:commerce");
        const overlays = await sourceOverlays.getAllOverlays();
        const installedDashboards = await dashboards.getDashboardsForSource("commerce");
        const endpointUrns = source?.endpoints.map((endpoint) => endpoint.urn) ?? [];
        const endpointTargets = Object.fromEntries(
            source?.endpoints.map((endpoint) => [endpoint.urn, endpoint.targetUrl]) ?? [],
        );
        const functionSecrets = deployment?.functions[0]?.secrets ?? {};

        expect(catalog.map((entry) => entry.kind)).toContain("commerce");
        expect(definition).toMatchObject({ kind: "commerce", version: "3.0.0", type: "source" });
        expect(definition.dependencies).toEqual([
            { name: "emailer", kind: "emailer", optional: true, versionRange: "^3.0.0" },
        ]);
        expect(JSON.stringify(definition).match(/\$selection\.(?!id)/g) ?? []).toEqual([]);
        expect(result.artifacts).toEqual(
            expect.arrayContaining([
                { type: "source", id: "urn:commerce", action: "created" },
                ...["product", "offer", "seller", "order"].map((entity) => ({
                    type: "sourceOverlay",
                    id: `commerce-${entity}-custom-fields`,
                    action: "created",
                })),
                { type: "sourceOverlay", id: "commerce-product-classification", action: "created" },
                { type: "trigger", id: "schedule-dispatch-commerce-notifications", action: "created" },
            ]),
        );
        expect(result.artifacts).not.toContainEqual(
            expect.objectContaining({ type: "dashboard", id: "commerce-dashboard" }),
        );
        expect(endpointUrns).toHaveLength(175);
        expect(endpointUrns).not.toEqual(
            expect.arrayContaining(["urn:commerce:variants", "urn:commerce:variant", "urn:commerce:upsertVariant"]),
        );
        expect(endpointUrns).toEqual(expect.arrayContaining(expectedEndpointUrns));
        expect(endpointTargets).toMatchObject({
            "urn:commerce:productVariants": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/variants`,
            "urn:commerce:productVariant": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/variant`,
            "urn:commerce:productImage": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/image`,
            "urn:commerce:reorderProductImages": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/images/reorder`,
            "urn:commerce:offerImage": `${supabaseUrl}/functions/v1/cms-commerce/admin/offer/image`,
            "urn:commerce:createMyOffer": `${supabaseUrl}/functions/v1/cms-commerce/me/offers`,
            "urn:commerce:publicOfferImage": `${supabaseUrl}/functions/v1/cms-commerce/offer/image`,
            "urn:commerce:submitMyOfferPrice": `${supabaseUrl}/functions/v1/cms-commerce/me/offer/price`,
            "urn:commerce:verifyPendingSellerPayoutEligibility": `${supabaseUrl}/functions/v1/cms-commerce/system/seller/payout-eligibility`,
            "urn:commerce:getProtectedCheckoutSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/protected-checkout/seller-context`,
            "urn:commerce:getProtectedPaymentSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/protected-payment/seller-context`,
            "urn:commerce:getOfferNegotiationContext": `${supabaseUrl}/functions/v1/cms-commerce/system/offer/negotiation-context`,
            "urn:commerce:getPaymentOrderContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/payment-context`,
            "urn:commerce:getOrderFulfillmentBuyerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/payment-context`,
            "urn:commerce:getOrderFulfillmentSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/fulfillment/seller-context`,
            "urn:commerce:getOrderShipmentCreationSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/shipment-creation/seller-context`,
            "urn:commerce:getOrderLabelSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/label/seller-context`,
            "urn:commerce:getOrderDeliverySetupContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/delivery-setup-context`,
            "urn:commerce:getOrderDeliverySelectionContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/delivery-selection-context`,
            "urn:commerce:createOrder": `${supabaseUrl}/functions/v1/cms-commerce/me/orders`,
            "urn:commerce:mySales": `${supabaseUrl}/functions/v1/cms-commerce/me/sales`,
            "urn:commerce:mySale": `${supabaseUrl}/functions/v1/cms-commerce/me/sale`,
            "urn:commerce:reviewOffer": `${supabaseUrl}/functions/v1/cms-commerce/admin/offer/review`,
            "urn:commerce:offerCustomFields": `${supabaseUrl}/functions/v1/cms-commerce/configuration/offer-custom-fields`,
            "urn:commerce:entityCustomFields": `${supabaseUrl}/functions/v1/cms-commerce/configuration/custom-fields`,
            "urn:commerce:getMyNotificationPreferences": `${supabaseUrl}/functions/v1/cms-commerce/notifications/preferences`,
            "urn:commerce:claimNotifications": `${supabaseUrl}/functions/v1/cms-commerce/notifications/system/claim`,
            "urn:commerce:listDefaultNotificationTemplates": `${supabaseUrl}/functions/v1/cms-commerce/notifications/templates`,
            "urn:commerce:submitMyMarketplaceServiceWithdrawalRequest": `${supabaseUrl}/functions/v1/cms-commerce/me/order/service-withdrawal-requests`,
            "urn:commerce:myMarketplaceServiceWithdrawalRequests": `${supabaseUrl}/functions/v1/cms-commerce/me/order/service-withdrawal-requests`,
            "urn:commerce:marketplaceServiceWithdrawalRequests": `${supabaseUrl}/functions/v1/cms-commerce/admin/service-withdrawal-requests`,
            "urn:commerce:reviewMarketplaceServiceWithdrawalRequest": `${supabaseUrl}/functions/v1/cms-commerce/admin/service-withdrawal-request/review`,
        });
        expect(
            source?.endpoints.find((endpoint) => endpoint.urn === "urn:commerce:upsertCustomField")?.effects,
        ).toEqual({ invalidatesSchema: true });
        for (const endpointId of [
            "listNotificationDeliveries",
            "getNotificationConfiguration",
            "updateNotificationConfiguration",
        ]) {
            const endpoint = source?.endpoints.find((candidate) => candidate.urn === `urn:commerce:${endpointId}`);
            expect(endpoint?.access).toEqual({ mode: "admin" });
            expect(endpoint?.headers?.map((header) => header.name)).toEqual([
                "authorization",
                "x-cms-user-id",
                "x-cms-user-role",
            ]);
        }
        expect(
            source?.endpoints.find((endpoint) => endpoint.urn === "urn:commerce:verifyPendingSellerPayoutEligibility")
                ?.access,
        ).toEqual({ mode: "system" });
        for (const endpointId of ["getProtectedCheckoutSellerContext", "getProtectedPaymentSellerContext"]) {
            const endpoint = source?.endpoints.find((candidate) => candidate.urn === `urn:commerce:${endpointId}`);
            expect(endpoint?.access).toEqual({ mode: "system" });
            expect(endpoint?.output?.[0]?.body?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
            expect(endpoint?.output?.[0]?.body?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        }
        const negotiationContext = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:commerce:getOfferNegotiationContext",
        );
        expect(negotiationContext?.access).toEqual({ mode: "system" });
        expect(negotiationContext?.output?.[0]?.body?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
        for (const endpointId of ["submitMyOfferPrice", "createOrder"]) {
            const rawEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === `urn:commerce:${endpointId}`);
            if (!rawEndpoint) {
                throw new Error(`${endpointId} endpoint not found`);
            }
            for (const [role, callerMode] of [
                [USER_ROLE, "auth"],
                [ADMIN_ROLE, "admin"],
            ] as const) {
                let upstreamCalls = 0;
                const response = await handleSourceRequest(
                    sources,
                    new Request(`https://site.test/.cms/sources/commerce/${endpointId}`, {
                        method: "POST",
                    }),
                    {
                        prefix: "/.cms/sources/",
                        deps: {
                            authorizeEndpoint: async (endpoint) =>
                                sourceEndpointAccessAllows(sourceEndpointAccessMode(endpoint), callerMode)
                                    ? true
                                    : { authorized: false, status: 403 },
                            fetchImpl: async () => {
                                upstreamCalls += 1;
                                return Response.json({ error: `${role} bypassed system access` });
                            },
                        },
                    },
                );
                expect(response.status).toBe(403);
                expect(upstreamCalls).toBe(0);
            }
        }
        const claimNotifications = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:commerce:claimNotifications",
        );
        if (!claimNotifications) {
            throw new Error("claimNotifications endpoint not found");
        }
        const acceptedAgreementContext = {
            contractVersion: 1,
            event: {
                type: "commerce.price_agreement.accepted",
                occurredAt: "2026-07-23T12:00:00.000Z",
            },
            recipient: { userId: "agreement-buyer" },
            agreement: {
                id: "11111111-1111-4111-8111-111111111111",
                version: 2,
                status: "active",
                unitAmountMinor: 12000,
                quantity: 1,
                subtotalAmountMinor: 12000,
                subtotalAmountFormatted: "120.00 EUR",
                currency: "EUR",
                expiresAt: "2026-07-24T12:00:00.000Z",
            },
            offer: { id: 42, slug: "racket", title: "Racket" },
            delivery: { status: "accepted", label: "Offer accepted" },
            action: {
                path: "/checkout?agreementId=11111111-1111-4111-8111-111111111111",
            },
            source: {},
        };
        const claimResponse = await executeEndpoint(
            claimNotifications,
            new Request("https://cms.test/.cms/sources/commerce/claimNotifications", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ runKey: "strict-agreement-context" }),
            }),
            {
                responseProjectionMode: "strict",
                resolveSecret: async () => "commerce-api-key",
                fetchImpl: async () =>
                    Response.json({
                        items: [
                            {
                                deliveryId: "22222222-2222-4222-8222-222222222222",
                                recipientCmsUserId: "agreement-buyer",
                                templateKey: "commerce.price_agreement.accepted",
                                idempotencyKey: "agreement-notification-1",
                                context: acceptedAgreementContext,
                            },
                        ],
                    }),
            },
        );
        expect(claimResponse.status).toBe(200);
        expect((await claimResponse.json()).items[0].context).toEqual(acceptedAgreementContext);
        const deliveryAuthorization = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:commerce:getOrderDeliveryQuoteAuthorization",
        )?.output?.[0]?.body;
        expect(deliveryAuthorization?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        expect(deliveryAuthorization?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
        const fulfillmentAuthorization = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:commerce:getOrderFulfillmentAuthorization",
        )?.output?.[0]?.body;
        expect(fulfillmentAuthorization?.properties?.sellerId?.semantic?.authority).toBe("cms");
        expect(fulfillmentAuthorization?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        const paymentPreparation = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:commerce:prepareProtectedPayment",
        )?.output?.[0]?.body;
        expect(paymentPreparation?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        expect(paymentPreparation?.properties?.sellerId?.semantic?.authority).toBe("cms");
        expect(overlays).toHaveLength(5);
        expect(overlays).toEqual(
            expect.arrayContaining(
                ["product", "offer", "seller", "order"].map((entity) =>
                    expect.objectContaining({
                        id: `commerce-${entity}-custom-fields`,
                        sourceId: "commerce",
                        fieldSource: {
                            endpointId: "entityCustomFields",
                            params: { entityType: entity },
                            path: "fields",
                            map: expect.objectContaining({ options: "options" }),
                        },
                    }),
                ),
            ),
        );
        const classification = overlays.find((overlay) => overlay.id === "commerce-product-classification");
        if (!source || !classification) {
            throw new Error("commerce product classification overlay was not imported");
        }
        const enrichedSource = applySourceOverlays(source, [classification]);
        const nullableClassification = {
            brandId: null,
            brand: null,
            primaryCategoryId: null,
            primaryCategory: null,
        };
        const classificationCases: Array<[string, unknown]> = [
            ["product", nullableClassification],
            ["manageProduct", nullableClassification],
            ["upsertProduct", nullableClassification],
            ["offer", { product: nullableClassification }],
            ["offers", { items: [{ product: nullableClassification }] }],
            ["manageOffer", { product: nullableClassification }],
            ["myOffer", { product: nullableClassification }],
        ];
        for (const [endpointId, value] of classificationCases) {
            const shape = enrichedSource.endpoints
                .find((endpoint) => endpoint.urn === `urn:commerce:${endpointId}`)
                ?.output?.find((output) => output.status === "200")?.body;
            if (!shape) {
                throw new Error(`missing 200 output shape for ${endpointId}`);
            }
            expect(projectStrictDataShape(value, shape, "response", { enforceRequired: false })).toEqual(value);
        }
        expect(source?.meta).toMatchObject({
            icon: "assets/icon.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(installedDashboards).toEqual([]);
        expect(
            source?.endpoints.find((endpoint) => endpoint.urn === "urn:commerce:manageOffer")?.output?.[0]?.body
                ?.properties?.wholeUnitPrices,
        ).toMatchObject({ type: "boolean" });
        expect(await dashboards.getDashboard("commerce-dashboard")).toBeNull();
        expect(deployment?.dataApiSchemas).toEqual(["commerce"]);
        expect(deployment?.functions.map((fn) => fn.name)).toEqual(["cms-commerce"]);
        expect(String(functionSecrets.CMS_COMMERCE_API_KEY)).toStartWith("cms_co_");
    });
});
