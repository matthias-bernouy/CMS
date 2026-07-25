import { describe, expect, test } from "bun:test";
import { connectorRequest, installConnectorHarness, requests } from "./harness";

installConnectorHarness();

describe("sales-configurator partner capability commands", () => {
    for (const [input, expected] of [
        [true, true],
        ["true", true],
        [false, false],
        ["false", false],
    ] as const) {
        test(`normalizes canonical enabled value ${JSON.stringify(input)}`, async () => {
            const result = await connectorRequest("/admin/partner/capability?partnerId=7", {
                userId: "admin-a",
                userRole: "admin",
                body: {
                    capability: "proposals.manage",
                    enabled: input,
                },
            });

            expect(result.status).toBe(200);
            const command = requests().find((request) => request.url.pathname.endsWith("/rpc/set_partner_capability"));
            expect(command?.body).toEqual({
                p_partner_account_id: 7,
                p_capability: "proposals.manage",
                p_enabled: expected,
            });
        });
    }

    for (const input of ["TRUE", "False", 1, 0, null]) {
        test(`rejects non-canonical enabled value ${JSON.stringify(input)}`, async () => {
            const result = await connectorRequest("/admin/partner/capability?partnerId=7", {
                userId: "admin-a",
                userRole: "admin",
                body: {
                    capability: "proposals.manage",
                    enabled: input,
                },
            });

            expect(result.status).toBe(400);
            expect(await result.json()).toEqual({ error: "enabled must be a boolean" });
            expect(requests()).toEqual([]);
        });
    }
});
