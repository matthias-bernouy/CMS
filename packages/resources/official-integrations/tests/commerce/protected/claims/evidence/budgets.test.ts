import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { useEvidenceResponder } from "./fixtures";
import { activeClaimRow, evidenceForm, evidenceRow } from "./raw";

installCommerceTestEnvironment();

describe("commerce optimized claim evidence call budgets", () => {
    test("preserves buyer and seller upload call order", async () => {
        for (const [scope, userId, expected] of [
            ["order", "buyer-evidence-17", [
                "get_claim_evidence_upload_context", "storage:POST",
                "attach_marketplace_claim_evidence",
            ]],
            ["sale", "seller-evidence-4", [
                "get_claim_evidence_upload_context", "storage:POST",
                "attach_marketplace_claim_evidence",
            ]],
        ] as const) {
            useEvidenceResponder();
            const before = capturedFetches().length;
            const response = await requestCommerce(
                `/me/${scope}/claim/evidence?claimId=${activeClaimRow.id}`,
                { userId, formData: evidenceForm() },
            );

            expect(response.status).toBe(201);
            const calls = capturedFetches().slice(before);
            expect(kinds(calls)).toEqual(expected);
            expect(contextBody(calls, "get_claim_evidence_upload_context")).toEqual({
                p_claim_id: activeClaimRow.id,
                p_actor_kind: scope === "order" ? "buyer" : "seller",
                p_actor_id: userId,
            });
        }
    });

    test("preserves buyer, seller, and administrator download call order", async () => {
        for (const [route, userId, expected] of [
            ["/me/order/claim/evidence", "buyer-evidence-17", [
                "get_claim_evidence_download_context", "storage:GET",
            ]],
            ["/me/sale/claim/evidence", "seller-evidence-4", [
                "get_claim_evidence_download_context", "storage:GET",
            ]],
            ["/admin/claim/evidence", undefined, [
                "get_claim_evidence_download_context", "storage:GET",
            ]],
        ] as const) {
            useEvidenceResponder();
            const before = capturedFetches().length;
            const response = await requestCommerce(
                `${route}?evidenceId=${evidenceRow.id}`,
                { userId },
            );

            expect(response.status).toBe(200);
            const calls = capturedFetches().slice(before);
            expect(kinds(calls)).toEqual(expected);
            expect(contextBody(calls, "get_claim_evidence_download_context")).toEqual({
                p_evidence_id: evidenceRow.id,
                p_scope: route.includes("/order/")
                    ? "buyer"
                    : route.includes("/sale/")
                    ? "seller"
                    : "admin",
                p_actor_id: userId ?? null,
            });
        }
    });

    test("does not touch Storage after an authorization refusal", async () => {
        useEvidenceResponder({
            claim: { ...activeClaimRow, buyer_cms_user_id: "another-buyer" },
        });
        const buyer = await requestCommerce(
            `/me/order/claim/evidence?claimId=${activeClaimRow.id}`,
            { userId: "buyer-evidence-17", formData: evidenceForm() },
        );
        expect(buyer.status).toBe(404);
        expect(kinds(capturedFetches())).toEqual(["get_claim_evidence_upload_context"]);

        useEvidenceResponder({ seller: { cms_user_id: "another-seller" } });
        const before = capturedFetches().length;
        const seller = await requestCommerce(
            `/me/sale/claim/evidence?claimId=${activeClaimRow.id}`,
            { userId: "seller-evidence-4", formData: evidenceForm() },
        );
        expect(seller.status).toBe(404);
        expect(kinds(capturedFetches().slice(before))).toEqual([
            "get_claim_evidence_upload_context",
        ]);
    });

    test("fails closed on inconsistent private contexts before Storage", async () => {
        const cases = [
            {
                path: `/me/order/claim/evidence?claimId=${activeClaimRow.id}`,
                options: { method: "POST", userId: "buyer-evidence-17" },
                value: { state: "ok", public_id: ".." },
                status: 502,
                error: "get_claim_evidence_upload_context returned an invalid response",
            },
            {
                path: `/me/order/claim/evidence?evidenceId=${evidenceRow.id}`,
                options: {},
                value: okDownloadContext(evidenceRow.storage_path),
                status: 401,
                error: "missing CMS user id",
            },
            {
                path: `/admin/claim/evidence?evidenceId=${evidenceRow.id}`,
                options: {},
                value: { state: "identity_required" },
                status: 502,
                error: "get_claim_evidence_download_context returned an invalid response",
            },
            {
                path: `/me/order/claim/evidence?evidenceId=${evidenceRow.id}`,
                options: { userId: "buyer-evidence-17" },
                value: okDownloadContext("../another-private-bucket/secret.pdf"),
                status: 502,
                error: "get_claim_evidence_download_context returned an invalid response",
            },
        ] as const;

        for (const item of cases) {
            setRestResponder(() => jsonResponse(item.value));
            const before = capturedFetches().length;
            const response = await requestCommerce(item.path, item.options);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: item.status,
                body: { error: item.error },
            });
            expect(kinds(capturedFetches().slice(before))).toEqual([
                item.path.includes("claimId=")
                    ? "get_claim_evidence_upload_context"
                    : "get_claim_evidence_download_context",
            ]);
        }
    });
});

function kinds(calls: Array<{ url: string; method: string }>): string[] {
    return calls.map(call => call.url.includes("/storage/v1/object/")
        ? `storage:${call.method}`
        : new URL(call.url).pathname.split("/").at(-1)!);
}

function contextBody(
    calls: ReturnType<typeof capturedFetches>,
    name: string,
): Record<string, unknown> {
    const call = calls.find(candidate => new URL(candidate.url).pathname.endsWith(`/rpc/${name}`));
    expect(call?.method).toBe("POST");
    expect(call?.headers.get("apikey")).toBe("sb_secret_test");
    expect(call?.headers.get("authorization")).toBeNull();
    return call!.body;
}

function okDownloadContext(storagePath: string): Record<string, unknown> {
    return {
        state: "ok",
        evidence: {
            storage_bucket: "commerce-claim-evidence",
            storage_path: storagePath,
            mime_type: "application/pdf",
        },
    };
}
