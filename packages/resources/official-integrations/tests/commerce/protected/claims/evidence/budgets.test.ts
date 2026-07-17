import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useEvidenceResponder } from "./fixtures";
import { activeClaimRow, evidenceForm, evidenceRow } from "./raw";

installCommerceTestEnvironment();

describe("commerce claim evidence baseline call budgets", () => {
    test("preserves buyer and seller upload call order", async () => {
        for (const [scope, userId, expected] of [
            ["order", "buyer-evidence-17", [
                "marketplace_claims", "storage:POST", "attach_marketplace_claim_evidence",
            ]],
            ["sale", "seller-evidence-4", [
                "marketplace_claims", "sellers", "storage:POST",
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
            expect(kinds(capturedFetches().slice(before))).toEqual(expected);
        }
    });

    test("preserves buyer, seller, and administrator download call order", async () => {
        for (const [route, userId, expected] of [
            ["/me/order/claim/evidence", "buyer-evidence-17", [
                "marketplace_claim_evidence", "marketplace_claims", "storage:GET",
            ]],
            ["/me/sale/claim/evidence", "seller-evidence-4", [
                "marketplace_claim_evidence", "marketplace_claims", "sellers", "storage:GET",
            ]],
            ["/admin/claim/evidence", undefined, [
                "marketplace_claim_evidence", "storage:GET",
            ]],
        ] as const) {
            useEvidenceResponder();
            const before = capturedFetches().length;
            const response = await requestCommerce(
                `${route}?evidenceId=${evidenceRow.id}`,
                { userId },
            );

            expect(response.status).toBe(200);
            expect(kinds(capturedFetches().slice(before))).toEqual(expected);
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
        expect(kinds(capturedFetches())).toEqual(["marketplace_claims"]);

        useEvidenceResponder({ seller: { cms_user_id: "another-seller" } });
        const before = capturedFetches().length;
        const seller = await requestCommerce(
            `/me/sale/claim/evidence?claimId=${activeClaimRow.id}`,
            { userId: "seller-evidence-4", formData: evidenceForm() },
        );
        expect(seller.status).toBe(404);
        expect(kinds(capturedFetches().slice(before))).toEqual([
            "marketplace_claims", "sellers",
        ]);
    });
});

function kinds(calls: Array<{ url: string; method: string }>): string[] {
    return calls.map(call => call.url.includes("/storage/v1/object/")
        ? `storage:${call.method}`
        : new URL(call.url).pathname.split("/").at(-1)!);
}
