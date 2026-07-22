import { describe, expect, test } from "bun:test";
import { callSaveRoute, type FailureStep, type LogicalStep, type SaveRoute } from "./harness.ts";

const cases: Array<{ failure: FailureStep; expected: LogicalStep[]; providerCalled: boolean }> = [
    { failure: "shipment", expected: ["shipment"], providerCalled: false },
    { failure: "settings", expected: ["shipment", "settings"], providerCalled: false },
    { failure: "provider", expected: ["shipment", "settings", "provider"], providerCalled: true },
    { failure: "write", expected: ["shipment", "settings", "provider", "write"], providerCalled: true },
];

describe("Mondial Relay selection setup failures", () => {
    for (const route of ["checkout", "claim-return"] as const) {
        for (const contract of cases) {
            test(`${route} stops after a ${contract.failure} failure`, async () => {
                const result = await callSaveRoute({ route, failure: contract.failure });

                expect(result.response.status).toBe(502);
                const body = (await result.response.json()) as { error: string };
                expect(body.error).toBe(
                    contract.failure === "provider"
                        ? "Mondial Relay relay lookup returned HTTP 503"
                        : "Supabase Data API request failed (500)",
                );
                expect(result.logicalSteps).toEqual(contract.expected);
                expect(result.providerRequests.length > 0).toBe(contract.providerCalled);
                expect(writeRequests(result.requests, route)).toHaveLength(contract.failure === "write" ? 1 : 0);
            });
        }
    }
});

function writeRequests(requests: Array<{ pathname: string }>, route: SaveRoute): Array<{ pathname: string }> {
    const writePath = route === "checkout" ? "/rest/v1/rpc/reserve_delivery_quote" : "/rest/v1/relay_selections";
    return requests.filter(({ pathname }) => pathname === writePath);
}
