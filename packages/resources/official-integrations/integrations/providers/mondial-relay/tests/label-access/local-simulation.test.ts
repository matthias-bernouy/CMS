import { describe, expect, test } from "bun:test";
import { createConnectShipment } from "../../connectors/supabase/functions/cms-delivery/provider/connect/client.ts";
import { localSimulationLabelUrl } from "../../connectors/supabase/functions/cms-delivery/provider/connect/local-label.ts";
import type { ShipmentPayload } from "../../connectors/supabase/functions/cms-delivery/shipment/types.ts";
import { rawToken, shipmentRow, useLabelScenario } from "./harness";

describe("local simulated shipment labels", () => {
    test("creates a deterministic label reference without contacting the carrier", async () => {
        const harness = await useLabelScenario({ localSimulation: true });
        const payload = { externalOrderId: "local-order-42" } as ShipmentPayload;
        const created = await createConnectShipment(payload);
        const replayed = await createConnectShipment(payload);
        expect(created.expeditionNumber).toMatch(/^\d{8}$/);
        expect(created.labelUrl).toBe(localSimulationLabelUrl(created.expeditionNumber));
        expect(replayed).toEqual(created);
        expect(harness.calls).toEqual([]);
    });

    test("serves a valid local PDF only after checking the seller capability", async () => {
        const harness = await useLabelScenario({
            localSimulation: true,
            shipment: shipmentRow({ label_url: localSimulationLabelUrl("12345678") }),
        });
        const denied = await harness.request({ token: rawToken, seller: "different-seller" });
        expect(denied.status).toBe(404);
        const response = await harness.request({ token: rawToken, seller: "seller-42" });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/pdf");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        const pdf = await response.text();
        expect(pdf).toStartWith("%PDF-1.4\n");
        expect(pdf).toContain("Shipment: 12345678");
        expect(pdf).toContain("not valid for carrier shipment");
        const xrefOffset = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
        expect(pdf.slice(xrefOffset)).toStartWith("xref\n");
        expect(harness.calls.every(({ kind }) => kind === "database")).toBe(true);
    });

    test("rejects simulated or mismatched label references outside their local contract", async () => {
        for (const [localSimulation, expeditionNumber] of [
            [false, "12345678"],
            [true, "87654321"],
        ] as const) {
            const harness = await useLabelScenario({
                localSimulation,
                shipment: shipmentRow({
                    label_url: localSimulationLabelUrl("12345678"),
                    expedition_number: expeditionNumber,
                }),
            });
            const response = await harness.request({ token: rawToken, seller: "seller-42" });
            expect(response.status).toBe(400);
            expect(harness.calls.every(({ kind }) => kind === "database")).toBe(true);
        }
    });
});
