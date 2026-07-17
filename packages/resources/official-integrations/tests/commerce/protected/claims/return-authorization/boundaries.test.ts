import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useReturnAuthorizationResponder } from "./fixtures";
import {
    claimId,
    sellerRow,
} from "./raw";

installCommerceTestEnvironment();

const route = `/system/claim/return-authorization?claimId=${claimId}`;

describe("commerce claim return authorization boundaries", () => {
    test("keeps OPTIONS public and rejects auth, method, and selector errors locally", async () => {
        const cases = [
            requestCommerce(route, { method: "OPTIONS", authenticated: false }),
            requestCommerce(route, { authenticated: false }),
            requestCommerce(route, { authorization: "Bearer wrong-key" }),
            requestCommerce(route, { method: "POST" }),
            requestCommerce("/system/claim/return-authorization"),
            requestCommerce("/system/claim/return-authorization?claimId="),
            requestCommerce("/system/claim/return-authorization?claimId=1.5"),
            requestCommerce("/system/claim/return-authorization?claimId=9007199254740992"),
        ];
        const responses = await Promise.all(cases);

        expect(await Promise.all(responses.map(responseBody))).toEqual([
            { status: 200, body: "ok" },
            { status: 401, body: { error: "invalid CMS API key" } },
            { status: 401, body: { error: "invalid CMS API key" } },
            { status: 405, body: "Method Not Allowed" },
            { status: 400, body: { error: "claimId is required" } },
            { status: 400, body: { error: "claimId is required" } },
            { status: 400, body: { error: "claimId must be an integer" } },
            { status: 400, body: { error: "claimId must be an integer" } },
        ]);
        expect(responses[3]!.headers.get("allow")).toBe("GET, OPTIONS");
        expect(capturedFetches()).toHaveLength(0);
    });

    test("preserves zero, negative, and large safe-integer lookup semantics", async () => {
        useReturnAuthorizationResponder({ claim: null });

        const zero = await requestCommerce(
            "/system/claim/return-authorization?claimId=0",
        );
        const negative = await requestCommerce(
            "/system/claim/return-authorization?claimId=-7",
        );
        const large = await requestCommerce(route);

        expect(await responseBody(zero)).toEqual({
            status: 404,
            body: { error: "claim not found" },
        });
        expect(await responseBody(negative)).toEqual({
            status: 404,
            body: { error: "claim not found" },
        });
        expect(await responseBody(large)).toEqual({
            status: 404,
            body: { error: "claim not found" },
        });
        expect(capturedFetches().map(call => {
            const url = new URL(call.url);
            return url.pathname.endsWith("/rpc/get_claim_return_authorization_context")
                ? `eq.${call.body.p_claim_id}`
                : url.searchParams.get("id");
        })).toEqual(["eq.0", "eq.-7", `eq.${claimId}`]);
    });

    test("keeps missing and incomplete participant errors distinct", async () => {
        useReturnAuthorizationResponder({ claim: null });
        expect(await responseBody(await requestCommerce(route))).toEqual({
            status: 404,
            body: { error: "claim not found" },
        });

        const cases = [
            { order: null },
            { seller: null },
            { seller: { ...sellerRow, cms_user_id: null } },
            { seller: { ...sellerRow, cms_user_id: " \t " } },
        ];
        for (const options of cases) {
            useReturnAuthorizationResponder(options);
            expect(await responseBody(await requestCommerce(route))).toEqual({
                status: 409,
                body: { error: "claim return participants are incomplete" },
            });
        }
    });

    test("validates a trimmed seller identity but returns its original value", async () => {
        useReturnAuthorizationResponder({
            seller: { ...sellerRow, cms_user_id: "  seller-return-17  " },
        });

        const response = await requestCommerce(route);

        expect(response.status).toBe(200);
        expect((await response.json()).sellerCmsUserId).toBe("  seller-return-17  ");
    });

    test("preserves exact upstream failure messages", async () => {
        for (const failure of ["claim", "order", "seller", "financialTerms"] as const) {
            const message = `${failure} database unavailable`;
            useReturnAuthorizationResponder({ failure, failureMessage: message });

            expect(await responseBody(await requestCommerce(route))).toEqual({
                status: 502,
                body: { error: message },
            });
        }
    });
});

async function responseBody(response: Response): Promise<{
    status: number;
    body: unknown;
}> {
    return {
        status: response.status,
        body: response.headers.get("content-type")?.includes("json")
            ? await response.json()
            : await response.text(),
    };
}
