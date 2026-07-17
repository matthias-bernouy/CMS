import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { claimEvidenceRows, claimEvents, claimReturnEvents, claimRow, useClaimDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce administrator claim detail boundaries", () => {
    test("rejects authentication, role, selector, and method errors before database work", async () => {
        const cases = [
            requestCommerce("/admin/claim?id=7", { authenticated: false }),
            requestCommerce("/admin/claim?id=7", { userRole: "user" }),
            requestCommerce("/admin/claim"),
            requestCommerce("/admin/claim?id=invalid"),
            requestCommerce("/admin/claim?id=7", { method: "POST" }),
        ];
        const responses = await Promise.all(cases);

        expect(await Promise.all(responses.map(async response => ({
            status: response.status,
            body: response.headers.get("content-type")?.includes("json")
                ? await response.json()
                : await response.text(),
        })))).toEqual([
            { status: 401, body: { error: "invalid CMS API key" } },
            { status: 403, body: { error: "CMS admin role is required" } },
            { status: 400, body: { error: "id is required" } },
            { status: 400, body: { error: "id must be an integer" } },
            { status: 405, body: "Method Not Allowed" },
        ]);
        expect(capturedFetches()).toHaveLength(0);
    });

    test("keeps an administrator read independent from a CMS user id", async () => {
        useClaimDetailResponder();

        const response = await requestCommerce("/admin/claim?id=7", { userRole: "admin" });

        expect(response.status).toBe(200);
    });

    test("preserves safe-integer claim ids beyond the signed 32-bit range", async () => {
        useClaimDetailResponder();

        const response = await requestCommerce("/admin/claim?id=3000000000");
        const firstCall = capturedFetches()[0]!;
        const url = new URL(firstCall.url);

        expect(response.status).toBe(200);
        expect(url.pathname.endsWith("/rpc/get_marketplace_claim_read_model")
            ? firstCall.body.p_claim_id
            : url.searchParams.get("id")).toBe(
                url.pathname.endsWith("/rpc/get_marketplace_claim_read_model")
                    ? 3_000_000_000
                    : "eq.3000000000",
            );
    });

    test("returns the exact hidden missing-claim response", async () => {
        useClaimDetailResponder({ claim: null });

        const response = await requestCommerce("/admin/claim?id=0");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "claim not found" });
    });

    test("preserves the initial PostgREST failure mapping", async () => {
        setRestResponder(request => responseForFailure(request, "claim lookup unavailable", true));

        const response = await requestCommerce("/admin/claim?id=7");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "claim lookup unavailable" });
    });

    test("preserves relation hydration failure mapping after finding the claim", async () => {
        setRestResponder(request => responseForFailure(request, "claim events unavailable", false));

        const response = await requestCommerce("/admin/claim?id=7");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "claim events unavailable" });
    });
});

function responseForFailure(request: Request, message: string, failInitial: boolean): Response {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/rest/v1/rpc/get_marketplace_claim_read_model")) {
        return jsonResponse({ message }, 503);
    }
    if (path.endsWith("/rest/v1/marketplace_claims")) {
        return failInitial ? jsonResponse({ message }, 503) : jsonResponse([claimRow]);
    }
    if (path.endsWith("/rest/v1/marketplace_claim_events")) {
        return failInitial ? jsonResponse(claimEvents) : jsonResponse({ message }, 503);
    }
    if (path.endsWith("/rest/v1/marketplace_claim_evidence")) return jsonResponse(claimEvidenceRows);
    if (path.endsWith("/rest/v1/marketplace_claim_return_events")) return jsonResponse(claimReturnEvents);
    throw new Error(`unexpected claim detail request ${request.url}`);
}
