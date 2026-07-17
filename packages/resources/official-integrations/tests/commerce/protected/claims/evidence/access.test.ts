import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useEvidenceResponder } from "./fixtures";
import { activeClaimRow, evidenceRow } from "./raw";

installCommerceTestEnvironment();

describe("commerce claim evidence access boundaries", () => {
    test("rejects API-key, method, role, and selector errors before external work", async () => {
        const cases = [
            requestCommerce("/me/order/claim/evidence?evidenceId=7", {
                authenticated: false,
            }),
            requestCommerce("/me/order/claim/evidence?evidenceId=7", {
                method: "DELETE",
            }),
            requestCommerce("/admin/claim/evidence?evidenceId=7", {
                method: "DELETE",
                userRole: "user",
            }),
            requestCommerce("/admin/claim/evidence?evidenceId=7", {
                method: "DELETE",
            }),
            requestCommerce("/me/order/claim/evidence"),
            requestCommerce("/me/order/claim/evidence?evidenceId=invalid"),
            requestCommerce("/me/order/claim/evidence?evidenceId=0"),
        ];
        const responses = await Promise.all(cases);

        expect(await Promise.all(responses.map(summary))).toEqual([
            { status: 401, body: { error: "invalid CMS API key" }, allow: null },
            { status: 405, body: "Method Not Allowed", allow: "GET, POST, OPTIONS" },
            { status: 403, body: { error: "CMS admin role is required" }, allow: null },
            { status: 405, body: "Method Not Allowed", allow: "GET, OPTIONS" },
            { status: 400, body: { error: "evidenceId is required" }, allow: null },
            { status: 400, body: { error: "evidenceId must be an integer" }, allow: null },
            { status: 400, body: { error: "evidenceId must be positive" }, allow: null },
        ]);
        expect(capturedFetches()).toHaveLength(0);
    });

    test("keeps OPTIONS public and independent from persistence", async () => {
        const response = await requestCommerce("/me/order/claim/evidence", {
            authenticated: false,
            method: "OPTIONS",
        });

        expect({ status: response.status, body: await response.text() }).toEqual({
            status: 200,
            body: "ok",
        });
        expect(capturedFetches()).toHaveLength(0);
    });

    test("authorizes upload before parsing multipart content", async () => {
        useEvidenceResponder({
            claim: { ...activeClaimRow, buyer_cms_user_id: "another-buyer" },
        });
        const denied = await requestCommerce(
            `/me/order/claim/evidence?claimId=${activeClaimRow.id}`,
            { method: "POST", userId: "buyer-evidence-17" },
        );
        expect(await summary(denied)).toEqual({
            status: 404, body: { error: "claim not found" }, allow: null,
        });

        useEvidenceResponder();
        const before = capturedFetches().length;
        const malformed = await requestCommerce(
            `/me/order/claim/evidence?claimId=${activeClaimRow.id}`,
            { method: "POST", userId: "buyer-evidence-17" },
        );
        expect(await summary(malformed)).toEqual({
            status: 400,
            body: { error: "claim evidence upload must use multipart/form-data" },
            allow: null,
        });
        expect(resources(capturedFetches().slice(before))).toEqual([
            "get_claim_evidence_upload_context",
        ]);
    });

    test("requires upload identity before database work", async () => {
        const response = await requestCommerce(
            `/me/order/claim/evidence?claimId=${activeClaimRow.id}`,
            { method: "POST" },
        );

        expect(await summary(response)).toEqual({
            status: 401, body: { error: "missing CMS user id" }, allow: null,
        });
        expect(capturedFetches()).toHaveLength(0);
    });

    test("preserves download evidence-before-identity precedence", async () => {
        useEvidenceResponder({ evidence: null });
        const missing = await requestCommerce(
            `/me/order/claim/evidence?evidenceId=${evidenceRow.id}`,
        );
        expect(await summary(missing)).toEqual({
            status: 404, body: { error: "claim evidence not found" }, allow: null,
        });
        expect(resources(capturedFetches())).toEqual([
            "get_claim_evidence_download_context",
        ]);

        useEvidenceResponder();
        const before = capturedFetches().length;
        const noIdentity = await requestCommerce(
            `/me/order/claim/evidence?evidenceId=${evidenceRow.id}`,
        );
        expect(await summary(noIdentity)).toEqual({
            status: 401, body: { error: "missing CMS user id" }, allow: null,
        });
        expect(resources(capturedFetches().slice(before))).toEqual([
            "get_claim_evidence_download_context",
        ]);
    });
});

async function summary(response: Response): Promise<{
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

function resources(calls: Array<{ url: string }>): string[] {
    return calls.map(call => new URL(call.url).pathname.split("/").at(-1)!);
}
