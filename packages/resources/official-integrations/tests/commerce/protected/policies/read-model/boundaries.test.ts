import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { c2cReadModelEnvelope, useC2cPolicyResponder } from "./fixtures";
import { componentRows } from "./raw";

installCommerceTestEnvironment();

describe("commerce protected C2C policy read boundaries", () => {
    test("rejects authentication, role, and method errors before database work", async () => {
        const unauthenticated = await requestCommerce("/admin/c2c-policies", {
            authenticated: false,
        });
        const wrongRole = await requestCommerce("/admin/c2c-policies", { userRole: "user" });
        const wrongRoleMethod = await requestCommerce("/admin/c2c-policies", {
            method: "DELETE",
            userRole: "user",
        });
        const wrongMethod = await requestCommerce("/admin/c2c-policies", { method: "DELETE" });

        expect(await responseSummary(unauthenticated)).toEqual({
            status: 401, body: { error: "invalid CMS API key" }, allow: null,
        });
        expect(await responseSummary(wrongRole)).toEqual({
            status: 403, body: { error: "CMS admin role is required" }, allow: null,
        });
        expect(await responseSummary(wrongRoleMethod)).toEqual({
            status: 403, body: { error: "CMS admin role is required" }, allow: null,
        });
        expect(await responseSummary(wrongMethod)).toEqual({
            status: 405, body: "Method Not Allowed", allow: "GET, POST, OPTIONS",
        });
        expect(capturedFetches()).toHaveLength(0);
    });

    test("keeps OPTIONS public and administrator reads independent from a user id", async () => {
        const options = await requestCommerce("/admin/c2c-policies", {
            authenticated: false,
            method: "OPTIONS",
        });
        useC2cPolicyResponder();
        const read = await requestCommerce("/admin/c2c-policies", { userRole: "admin" });

        expect({ status: options.status, body: await options.text() }).toEqual({
            status: 200, body: "ok",
        });
        expect(read.status).toBe(200);
    });

    test("preserves exact missing settings, policy, and component errors", async () => {
        const cases = [
            [{ settings: null }, "commerce settings are missing"],
            [{ feePolicy: null }, "active protected C2C policy revision is incomplete"],
            [{ protectionPolicy: null }, "active protected C2C policy revision is incomplete"],
            [{ sellerRiskPolicy: null }, "active protected C2C policy revision is incomplete"],
            [{ components: componentRows.slice(0, 1) }, "active protected C2C fee components are incomplete"],
            [{ components: componentRows.slice(1) }, "active protected C2C fee components are incomplete"],
        ] as const;

        for (const [responder, message] of cases) {
            useC2cPolicyResponder(responder);
            const response = await requestCommerce("/admin/c2c-policies");

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 500,
                body: { error: message },
            });
        }
    });

    test("preserves historical upstream failure messages", async () => {
        for (const message of ["settings lookup unavailable", "components unavailable"]) {
            useC2cPolicyResponder({ failure: { message } });
            const response = await requestCommerce("/admin/c2c-policies");

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 502,
                body: { error: message },
            });
        }
    });

    test("fails closed on malformed private read-model envelopes", async () => {
        const complete = c2cReadModelEnvelope();
        for (const value of [
            null,
            {},
            { state: "unexpected" },
            { state: "ok" },
            { ...complete, settings: {} },
            { ...complete, components: [null] },
        ]) {
            setRestResponder(() => jsonResponse(value));
            const response = await requestCommerce("/admin/c2c-policies");

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 502,
                body: {
                    error: "get_c2c_policy_configuration_read_model returned an invalid response",
                },
            });
        }
    });
});

async function responseSummary(response: Response): Promise<{
    status: number;
    body: unknown;
    allow: string | null;
}> {
    return {
        status: response.status,
        body: response.headers.get("content-type")?.includes("json")
            ? await response.json()
            : await response.text(),
        allow: response.headers.get("allow"),
    };
}
