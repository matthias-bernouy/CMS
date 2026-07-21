import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { importIntegration, type IntegrationBlocArtifact, type IntegrationConnectorDeployment } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";
import { blocImporter, connectorDeployer, installedBasicBlocs } from "./contracts/setup";
import { expectedEndpointUrns } from "./contracts/expectations";
import { installCommerceTestEnvironment, supabaseUrl } from "./harness";
installCommerceTestEnvironment();
describe("commerce 1.0.0 contract", () => {
    test("loads and imports the official Commerce contract", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const catalog = await repository.list();
        const definition = await repository.get("commerce");
        if (!definition) throw new Error("commerce definition not found");
        const sources = new InMemorySourceRepository(), sourceOverlays = new InMemorySourceOverlayRepository();
        const dashboards = new InMemoryDashboardRepository();
        const secrets = new InMemorySecretStore(), roles = new InMemoryRolesRepository();
        const importedBlocs: IntegrationBlocArtifact[] = [];
        const installations = await installedBasicBlocs();
        let deployment: IntegrationConnectorDeployment | undefined;
        const deployer = connectorDeployer(value => { deployment = value; });
        const result = await importIntegration(
            {
                sources,
                sourceOverlays,
                dashboards,
                secrets,
                roles,
                installations,
                connectorDeployers: [deployer],
                blocs: blocImporter(importedBlocs),
            },
            { kind: "commerce", answers: { id: "commerce" }, options: {} },
            [definition],
        );
        const source = await sources.getSource("urn:commerce");
        const overlays = await sourceOverlays.getAllOverlays();
        const installedDashboards = await dashboards.getDashboardsForSource("commerce");
        const dashboardIds = [
            "commerce-configuration", "commerce-metadata", "commerce-offers", "commerce-orders",
            "commerce-products", "commerce-sellers", "commerce-taxonomy", "commerce-workflow",
        ];
        const endpointUrns = source?.endpoints.map(endpoint => endpoint.urn) ?? [];
        const endpointTargets = Object.fromEntries(
            source?.endpoints.map(endpoint => [endpoint.urn, endpoint.targetUrl]) ?? [],
        );
        const functionSecrets = deployment?.functions[0]?.secrets ?? {};

        expect(catalog.map(entry => entry.kind)).toContain("commerce");
        expect(definition).toMatchObject({ kind: "commerce", version: "1.0.0" });
        expect(definition.dependencies).toEqual([{ name: "basicBlocs", kind: "basic-blocs" }]);
        expect(JSON.stringify(definition).match(/\$selection\.(?!id)/g) ?? []).toEqual([]);
        expect(result.artifacts).toEqual(expect.arrayContaining([
            { type: "source", id: "urn:commerce", action: "created" },
            { type: "bloc", id: "commerce-account-offers", action: "created" },
            { type: "bloc", id: "commerce-account-sales", action: "created" },
            { type: "bloc", id: "commerce-sale-detail", action: "created" },
            ...["product", "offer", "seller", "order"].map(entity =>
                ({ type: "sourceOverlay", id: `commerce-${entity}-custom-fields`, action: "created" })),
            { type: "sourceOverlay", id: "commerce-product-classification", action: "created" },
            ...dashboardIds.map(id => ({ type: "dashboard", id, action: "created" })),
        ]));
        expect(result.artifacts).not.toContainEqual(expect.objectContaining({ type: "dashboard", id: "commerce-dashboard" }));
        expect(importedBlocs.map(bloc => bloc.tag)).toEqual([
            "commerce-offer-list",
            "commerce-offer-filter",
            "commerce-offer-preview",
            "commerce-account-offers",
            "commerce-account-sales",
            "commerce-sale-detail",
            "commerce-offer-price-form",
        ]);
        expect(endpointUrns).toHaveLength(154);
        expect(endpointUrns).not.toEqual(expect.arrayContaining([
            "urn:commerce:variants",
            "urn:commerce:variant",
            "urn:commerce:upsertVariant",
        ]));
        expect(endpointUrns).toEqual(expect.arrayContaining(expectedEndpointUrns));
        expect(endpointTargets).toMatchObject({
            "urn:commerce:productVariants": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/variants`,
            "urn:commerce:productVariant": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/variant`,
            "urn:commerce:productImage": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/image`,
            "urn:commerce:reorderProductImages": `${supabaseUrl}/functions/v1/cms-commerce/admin/product/images/reorder`,
            "urn:commerce:offerImage": `${supabaseUrl}/functions/v1/cms-commerce/admin/offer/image`,
            "urn:commerce:createMyOffer": `${supabaseUrl}/functions/v1/cms-commerce/me/offers`, "urn:commerce:offerEstimate": `${supabaseUrl}/functions/v1/cms-commerce/offer-estimate`,
            "urn:commerce:publicOfferImage": `${supabaseUrl}/functions/v1/cms-commerce/offer/image`,
            "urn:commerce:submitMyOfferPrice": `${supabaseUrl}/functions/v1/cms-commerce/me/offer/price`,
            "urn:commerce:verifyPendingSellerPayoutEligibility": `${supabaseUrl}/functions/v1/cms-commerce/system/seller/payout-eligibility`,
            "urn:commerce:getProtectedCheckoutSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/protected-checkout/seller-context`,
            "urn:commerce:getProtectedPaymentSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/protected-payment/seller-context`,
            "urn:commerce:getOfferNegotiationContext": `${supabaseUrl}/functions/v1/cms-commerce/system/offer/negotiation-context`,
            "urn:commerce:getPaymentOrderContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/payment-context`,
            "urn:commerce:getOrderFulfillmentBuyerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/payment-context`,
            "urn:commerce:getOrderFulfillmentSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/fulfillment/seller-context`,
            "urn:commerce:getOrderLabelSellerContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/label/seller-context`,
            "urn:commerce:getOrderDeliverySetupContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/delivery-setup-context`,
            "urn:commerce:getOrderDeliverySelectionContext": `${supabaseUrl}/functions/v1/cms-commerce/system/order/delivery-selection-context`,
            "urn:commerce:createOrder": `${supabaseUrl}/functions/v1/cms-commerce/me/orders`,
            "urn:commerce:mySales": `${supabaseUrl}/functions/v1/cms-commerce/me/sales`,
            "urn:commerce:mySale": `${supabaseUrl}/functions/v1/cms-commerce/me/sale`,
            "urn:commerce:reviewOffer": `${supabaseUrl}/functions/v1/cms-commerce/admin/offer/review`,
            "urn:commerce:offerCustomFields": `${supabaseUrl}/functions/v1/cms-commerce/configuration/offer-custom-fields`,
            "urn:commerce:entityCustomFields": `${supabaseUrl}/functions/v1/cms-commerce/configuration/custom-fields`,
        });
        expect(source?.endpoints.find(endpoint => endpoint.urn === "urn:commerce:upsertCustomField")?.effects).toEqual({ invalidatesSchema: true });
        expect(source?.endpoints.find(endpoint => endpoint.urn === "urn:commerce:verifyPendingSellerPayoutEligibility")?.access)
            .toEqual({ mode: "system" });
        for (const endpointId of ["getProtectedCheckoutSellerContext", "getProtectedPaymentSellerContext"]) {
            const endpoint = source?.endpoints.find(candidate => candidate.urn === `urn:commerce:${endpointId}`);
            expect(endpoint?.access).toEqual({ mode: "system" });
            expect(endpoint?.output?.[0]?.body?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
            expect(endpoint?.output?.[0]?.body?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        }
        const negotiationContext = source?.endpoints.find(
            endpoint => endpoint.urn === "urn:commerce:getOfferNegotiationContext",
        );
        expect(negotiationContext?.access).toEqual({ mode: "system" });
        expect(negotiationContext?.output?.[0]?.body?.properties?.sellerCmsUserId?.semantic?.authority)
            .toBe("cms");
        const deliveryAuthorization = source?.endpoints.find(
            endpoint => endpoint.urn === "urn:commerce:getOrderDeliveryQuoteAuthorization",
        )?.output?.[0]?.body;
        expect(deliveryAuthorization?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        expect(deliveryAuthorization?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
        const fulfillmentAuthorization = source?.endpoints.find(
            endpoint => endpoint.urn === "urn:commerce:getOrderFulfillmentAuthorization",
        )?.output?.[0]?.body;
        expect(fulfillmentAuthorization?.properties?.sellerId?.semantic?.authority).toBe("cms");
        expect(fulfillmentAuthorization?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        const paymentPreparation = source?.endpoints.find(
            endpoint => endpoint.urn === "urn:commerce:prepareProtectedPayment",
        )?.output?.[0]?.body;
        expect(paymentPreparation?.properties?.buyerCmsUserId?.semantic?.authority).toBe("cms");
        expect(paymentPreparation?.properties?.sellerId?.semantic?.authority).toBe("cms");
        expect(overlays).toHaveLength(5);
        expect(overlays).toEqual(expect.arrayContaining(["product", "offer", "seller", "order"].map(entity =>
            expect.objectContaining({
                id: `commerce-${entity}-custom-fields`,
                sourceId: "commerce",
                fieldSource: {
                    endpointId: "entityCustomFields",
                    params: { entityType: entity },
                    path: "fields",
                    map: expect.objectContaining({ options: "options" }),
                },
            }))));
        expect(source?.meta).toMatchObject({
            icon: "assets/icon.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(installedDashboards.map(dashboard => dashboard.id).sort()).toEqual(dashboardIds);
        expect(Object.fromEntries(installedDashboards.map(dashboard => [dashboard.id, {
            name: dashboard.meta.name,
            views: dashboard.views.map(view => view.id),
        }]))).toMatchObject({
            "commerce-configuration": { name: "Settings", views: ["commerceSettings", "protectedC2cPolicySettings", "conditionsTable", "conditionDetail"] },
            "commerce-workflow": { name: "Workflow", views: ["workflowStatesTable", "workflowTransitionsTable", "workflowStateDetail", "workflowTransitionDetail"] },
            "commerce-metadata": { name: "Metadata", views: ["customFieldsTable", "customFieldDetail"] },
        });
        for (const dashboard of installedDashboards) {
            expect(dashboard.meta).toMatchObject({
                icon: dashboard.id === "commerce-taxonomy"
                    ? "assets/products.svg"
                    : `assets/${dashboard.id.replace("commerce-", "")}.svg`,
                svg: expect.stringContaining("<svg"),
            });
        }
        expect(await dashboards.getDashboard("commerce-dashboard")).toBeNull();
        expect(deployment?.dataApiSchemas).toEqual(["commerce"]);
        expect(deployment?.functions.map(fn => fn.name)).toEqual(["cms-commerce"]);
        expect(String(functionSecrets.CMS_COMMERCE_API_KEY)).toStartWith("cms_co_");
    });
});
