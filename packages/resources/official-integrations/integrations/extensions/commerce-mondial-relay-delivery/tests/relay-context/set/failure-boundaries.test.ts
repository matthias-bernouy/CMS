import { describe, expect, test } from "bun:test";
import { authorization } from "../fixtures";
import { executeRelay, expectGenericFailure } from "../harness";
import { type FailurePoint, successfulResponder } from "../responders";
import { paths } from "./calls";

describe("setRelayPointForOrder boundaries", () => {
    for (const [failure, expectedPaths] of [
        ["context", ["/delivery-setup-context"]],
        ["account", ["/delivery-setup-context", "/account"]],
        ["save", ["/delivery-setup-context", "/account", "/relay-selection"]],
        ["resolve", ["/delivery-setup-context", "/account", "/relay-selection", "/resolve"]],
        ["lock", ["/delivery-setup-context", "/account", "/relay-selection", "/resolve", "/financial-lock"]],
    ] as const satisfies ReadonlyArray<[FailurePoint, string[]]>) {
        test(`stops at the first ${failure} failure without leaking it`, async () => {
            const result = await executeRelay("setRelayPointForOrder", successfulResponder({ failAt: failure }));

            await expectGenericFailure(result.response);
            expect(paths(result.calls)).toEqual(expectedPaths);
        });
    }

    test("never reaches the financial lock with incomplete fulfillment data", async () => {
        for (const incomplete of ["buyer", "seller"] as const) {
            const result = await executeRelay("setRelayPointForOrder", (request) => {
                if (new URL(request.url).pathname === "/relay-selection") {
                    return Response.json({ error: `${incomplete} profile is incomplete` }, { status: 409 });
                }
                return successfulResponder({
                    authorization:
                        incomplete === "buyer"
                            ? {
                                  shippingAddress: {
                                      ...authorization.shippingAddress,
                                      city: undefined,
                                  },
                              }
                            : {},
                    account: incomplete === "seller" ? { addressLine1: "" } : {},
                })(request);
            });

            await expectGenericFailure(result.response);
            expect(paths(result.calls)).toEqual(["/delivery-setup-context", "/account", "/relay-selection"]);
        }
    });
});
