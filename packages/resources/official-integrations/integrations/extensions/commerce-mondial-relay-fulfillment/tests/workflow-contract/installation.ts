import { expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationBlocArtifact,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { declaredBlocViewSources } from "../../../../../tests/helpers/blocArtifactSource";
import { installationsForFulfillment, sourcesForFulfillment } from "./harness";

export function registerInstallationTests(): void {
    test("installs seller-only fulfillment, protected labels, and system reconciliation", async () => {
        const sources = await sourcesForFulfillment();
        const functions = new InMemoryFunctionRepository();
        const roles = new InMemoryRolesRepository();
        const installations = await installationsForFulfillment();
        const triggers = new InMemoryTriggerRepository();
        const blocs: IntegrationBlocArtifact[] = [];
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
            "commerce-mondial-relay-fulfillment",
        );
        if (!definition) {
            throw new Error("fulfillment definition not found");
        }

        const result = await importIntegration(
            {
                sources,
                functions,
                roles,
                installations,
                triggers,
                blocs: {
                    async importBloc(artifact) {
                        blocs.push(artifact);
                        return { id: artifact.tag, action: "created" };
                    },
                },
            },
            { kind: definition.kind, answers: {}, options: {} },
            [definition],
        );

        const ids = [
            "getShipmentForOrder",
            "getShipmentForMySale",
            "createShipmentForMySale",
            "requestShipmentLabelForMySale",
            "declareShipmentHandoffForMySale",
            "getClaimReturnForMe",
            "setRelayPointForMyClaimReturn",
            "getRelayPointForMyClaimReturn",
            "createClaimReturnShipmentForMyPurchase",
            "requestClaimReturnLabelForMyPurchase",
            "reconcileMondialRelayShipmentOperations",
            "reconcileMondialRelayFulfillments",
            "publishMondialRelayDeliveryHealth",
            "recoverMondialRelayShipmentCreation",
            "recordMondialRelayClaimReturnCarrierAcceptance",
            "recordMondialRelayClaimReturnRecipientHandoff",
            "cancelMondialRelayShipment",
        ];
        expect(result.artifacts.filter((item) => item.type === "function").map((item) => item.id)).toEqual(ids);
        expect(await functions.getFunction("createShipmentForPaidOrder")).toBeNull();
        expect(
            (await triggers.getAllTriggers())
                .filter((trigger) => trigger.event.kind === "schedule")
                .map((trigger) => trigger.id),
        ).toEqual([
            "schedule-reconcile-mondial-relay-shipment-operations",
            "schedule-reconcile-mondial-relay-fulfillments",
            "schedule-publish-mondial-relay-delivery-health",
        ]);
        for (const id of ids) {
            const fn = await functions.getFunction(id);
            expect(fn).toBeDefined();
            expect(await validateFunction(fn!, { sources })).toEqual([]);
        }

        const serialized = JSON.stringify(definition);
        expect(serialized).not.toContain("stripe-connect");
        expect(serialized).not.toContain("getPaymentByClientReference");
        expect(serialized).not.toContain("$steps.shipment.labelUrl");
        expect(serialized).toContain("reserveOrderShipmentCreation");
        expect(serialized).toContain("completeOrderShipmentCreation");
        expect(serialized).toContain("recordOrderFulfillment");
        expect(serialized).toContain("recipientHandoffAt");

        const viewSources = declaredBlocViewSources(blocs[0] ?? {});
        expect(viewSources).toContain("requestShipmentLabelForMySale");
        expect(viewSources).toContain("declareShipmentHandoffForMySale");
        expect(viewSources).not.toContain("shipment?.labelUrl");
        expect(viewSources).not.toContain("location.assign");
        expect(viewSources).toContain('document.createElement("a")');
        expect(viewSources).toContain("noopener noreferrer");
        expect(viewSources).toContain("dataset.shipmentStatus");
        expect(viewSources).toContain('"Dépôt déclaré"');
        expect(viewSources).toContain('"Retélécharger l’étiquette"');
        expect(viewSources).toContain('"J’ai déposé le colis"');
        expect(viewSources).toContain('new CustomEvent("commerce-fulfillment:updated"');
        expect(viewSources).not.toContain("content.dataset.status");
        const importedTemplate = atob(blocs[0]?.source?.["template.html"] ?? "");
        expect(importedTemplate).toContain("data-label");
        expect(importedTemplate).toContain("data-handoff");
        expect(importedTemplate).not.toContain('data-handoff type="button" appearance="outlined"');

        const grants = (await roles.get(USER_ROLE))?.grants.map((grant) => grant.permission) ?? [];
        expect(grants).toEqual(
            expect.arrayContaining([
                "urn:system-functions:getShipmentForOrder",
                "urn:system-functions:getShipmentForMySale",
                "urn:system-functions:createShipmentForMySale",
                "urn:system-functions:requestShipmentLabelForMySale",
                "urn:system-functions:declareShipmentHandoffForMySale",
                "urn:system-functions:getClaimReturnForMe",
                "urn:system-functions:setRelayPointForMyClaimReturn",
                "urn:system-functions:getRelayPointForMyClaimReturn",
                "urn:system-functions:createClaimReturnShipmentForMyPurchase",
                "urn:system-functions:requestClaimReturnLabelForMyPurchase",
            ]),
        );
        expect(grants).not.toContain("urn:system-functions:reconcileMondialRelayFulfillments");
    });
}
