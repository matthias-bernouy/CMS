import { describe, expect, test } from "bun:test";
import { rawToken, shipmentRow, useLabelScenario } from "./harness";

const request = { token: rawToken, seller: "seller-42" };

describe("Mondial Relay protected label refusal precedence", () => {
    test("maps absent, revoked, and wrong-seller tokens to the same anti-enumeration 404", async () => {
        for (const [scenario, seller] of [
            [{ token: "missing" as const }, "seller-42"],
            [{ token: "revoked" as const }, "seller-42"],
            [{ token: "valid" as const }, "seller-other"],
        ] as const) {
            const harness = await useLabelScenario(scenario);
            const response = await harness.request({ token: rawToken, seller });
            expect([response.status, await response.json()]).toEqual([404, { error: "label token not found" }]);
            expect(harness.calls.filter(({ kind }) => kind === "database")).toHaveLength(1);
            expect(harness.calls.filter(({ kind }) => kind === "provider")).toEqual([]);
        }
    });

    test("keeps revoked and wrong-seller precedence over expiry or shipment failures", async () => {
        for (const [scenario, seller] of [
            [{ token: "revoked" as const, shipment: null }, "seller-42"],
            [
                { token: "valid" as const, shipment: shipmentRow({ status: "cancelled", label_url: null }) },
                "seller-other",
            ],
        ] as const) {
            const harness = await useLabelScenario(scenario);
            const response = await harness.request({ token: rawToken, seller });
            expect([response.status, await response.json()]).toEqual([404, { error: "label token not found" }]);
            expect(harness.calls.filter(({ kind }) => kind === "database")).toHaveLength(1);
            expect(harness.calls.filter(({ kind }) => kind === "provider")).toEqual([]);
        }
    });

    test("returns 410 for an expired token before observing a missing shipment", async () => {
        const harness = await useLabelScenario({ token: "expired", shipment: null });
        const response = await harness.request(request);

        expect([response.status, await response.json()]).toEqual([410, { error: "label token expired" }]);
        expect(harness.calls.filter(({ kind }) => kind === "database")).toHaveLength(1);
        expect(harness.calls.filter(({ kind }) => kind === "provider")).toEqual([]);
    });

    test("maps absent shipment, absent URL, and exactly the refused statuses to label 404", async () => {
        const shipments = [
            null,
            shipmentRow({ label_url: null }),
            shipmentRow({ label_url: "" }),
            ...["cancelled_unscanned", "cancelled", "manual_review"].map((status) => shipmentRow({ status })),
        ];
        for (const shipment of shipments) {
            const harness = await useLabelScenario({ shipment });
            const response = await harness.request(request);
            expect([response.status, await response.json()]).toEqual([404, { error: "label not found" }]);
            expect(harness.calls.filter(({ kind }) => kind === "database")).toHaveLength(1);
            expect(harness.calls.filter(({ kind }) => kind === "provider")).toEqual([]);
        }
    });

    test("does not reinterpret a whitespace-only historical label URL as missing", async () => {
        const harness = await useLabelScenario({ shipment: shipmentRow({ label_url: "   " }) });
        const response = await harness.request(request);

        expect([response.status, await response.json()]).toEqual([
            400,
            { error: "Mondial Relay label URL is invalid" },
        ]);
        expect(harness.calls.map(({ kind }) => kind)).toEqual(["database"]);
    });

    test("does not silently narrow the historical allowed status set", async () => {
        for (const status of ["carrier_accepted", "in_transit", "collected_by_recipient", "failed", "unknown"]) {
            const harness = await useLabelScenario({ shipment: shipmentRow({ status }) });
            const response = await harness.request(request);
            expect(response.status).toBe(200);
            expect(harness.calls.filter(({ kind }) => kind === "provider")).toHaveLength(1);
        }
    });
});
