import { describe, expect, test } from "bun:test";
import { useClaimReturnDatabase } from "./harness";

describe("Mondial Relay legacy claim return tracking boundaries", () => {
    test("authenticates before reading shipment data", async () => {
        const database = await useClaimReturnDatabase();

        const result = await database.requestLegacy("Bearer wrong-key");

        expect(result.shipment.status).toBe(401);
        expect(await result.shipment.json()).toEqual({ error: "unauthorized" });
        expect(result.tracking).toBeNull();
        expect(database.calls).toEqual([]);
    });

    test("validates the expedition number before every database read", async () => {
        const database = await useClaimReturnDatabase();

        for (const path of ["/shipment", "/tracking"]) {
            const response = await database.request(path);
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({
                error: path === "/shipment" ? "id or expeditionNumber is required" : "expeditionNumber is required",
            });
        }
        expect(database.calls).toEqual([]);
    });

    test("stops after the first read when the shipment is missing", async () => {
        const database = await useClaimReturnDatabase({ missing: true });

        const result = await database.requestLegacy();

        expect(result.shipment.status).toBe(404);
        expect(await result.shipment.json()).toEqual({ error: "shipment not found" });
        expect(result.tracking).toBeNull();
        expect(database.calls.map(({ pathname }) => pathname)).toEqual(["/rest/v1/shipments"]);
    });
});
