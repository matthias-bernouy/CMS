import { describe, expect, test } from "bun:test";
import { publicRelayPoint } from "./fixtures";
import { executeRelay } from "./harness";
import { successfulGetResponder } from "./responders";

describe("getRelayPointForOrder status independence", () => {
    test("keeps a finalized order readable in every later status", async () => {
        const result = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder({ order: { status: "completed" } }),
        );

        expect(result.response.status).toBe(200);
        expect(await result.response.json()).toEqual(publicRelayPoint);
        expect(result.calls.map((call) => call.url.pathname)).toEqual(["/delivery-selection-context", "/public"]);
    });
});
