import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { useEvidenceResponder } from "./fixtures";
import { activeClaimRow, evidenceContents, evidenceRow, resolvedClaimRow } from "./raw";

installCommerceTestEnvironment();

describe("commerce claim evidence download contracts", () => {
    test("lets the buyer download adverse evidence with the exact private file response", async () => {
        useEvidenceResponder();
        const response = await requestCommerce(`/me/order/claim/evidence?evidenceId=${evidenceRow.id}`, {
            userId: "buyer-evidence-17",
        });
        const calls = capturedFetches();
        const storage = calls.at(-1)!;

        expect(response.status).toBe(200);
        expect(await response.text()).toBe(evidenceContents);
        expect(
            Object.fromEntries(
                [
                    "content-type",
                    "cache-control",
                    "x-content-type-options",
                    "content-disposition",
                    "access-control-allow-origin",
                ].map((header) => [header, response.headers.get(header)]),
            ),
        ).toEqual({
            "content-type": "application/pdf",
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-disposition": `attachment; filename="claim-evidence-${evidenceRow.id}.pdf"`,
            "access-control-allow-origin": "*",
        });
        expect(decodeURIComponent(new URL(storage.url).pathname)).toBe(
            `/storage/v1/object/commerce-claim-evidence/${evidenceRow.storage_path}`,
        );
        expect(storage.method).toBe("GET");
        expect(storage.headers.get("apikey")).toBe("sb_secret_test");
        expect(storage.headers.get("authorization")).toBeNull();
    });

    test("preserves seller access and administrator access after claim resolution", async () => {
        useEvidenceResponder({
            evidence: {
                ...evidenceRow,
                submitted_by_kind: "buyer",
                storage_path: `claims/${activeClaimRow.public_id}/buyer/adverse-buyer.pdf`,
            },
        });
        const seller = await requestCommerce(`/me/sale/claim/evidence?evidenceId=${evidenceRow.id}`, {
            userId: "seller-evidence-4",
        });
        expect({ status: seller.status, body: await seller.text() }).toEqual({
            status: 200,
            body: evidenceContents,
        });

        useEvidenceResponder({
            claim: resolvedClaimRow,
            evidence: { ...evidenceRow, claim_id: resolvedClaimRow.id },
        });
        const admin = await requestCommerce(`/admin/claim/evidence?evidenceId=${evidenceRow.id}`);
        expect({ status: admin.status, body: await admin.text() }).toEqual({
            status: 200,
            body: evidenceContents,
        });
    });

    test("keeps participant ownership, active-claim, and bucket denials hidden", async () => {
        const cases = [
            {
                options: { claim: { ...activeClaimRow, buyer_cms_user_id: "another-buyer" } },
                route: "/me/order/claim/evidence",
                userId: "buyer-evidence-17",
                expectedCalls: ["get_claim_evidence_download_context"],
                error: "claim not found",
            },
            {
                options: { seller: { cms_user_id: "another-seller" } },
                route: "/me/sale/claim/evidence",
                userId: "seller-evidence-4",
                expectedCalls: ["get_claim_evidence_download_context"],
                error: "claim not found",
            },
            {
                options: {
                    claim: resolvedClaimRow,
                    evidence: { ...evidenceRow, claim_id: resolvedClaimRow.id },
                },
                route: "/me/order/claim/evidence",
                userId: "buyer-evidence-17",
                expectedCalls: ["get_claim_evidence_download_context"],
                error: "claim not found",
            },
            {
                options: { evidence: { ...evidenceRow, storage_bucket: "public-media" } },
                route: "/me/order/claim/evidence",
                userId: "buyer-evidence-17",
                expectedCalls: ["get_claim_evidence_download_context"],
                error: "claim evidence not found",
            },
        ];

        for (const item of cases) {
            useEvidenceResponder(item.options);
            const before = capturedFetches().length;
            const response = await requestCommerce(`${item.route}?evidenceId=${evidenceRow.id}`, {
                userId: item.userId,
            });

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 404,
                body: { error: item.error },
            });
            expect(capturedFetches().slice(before).map(resource)).toEqual(item.expectedCalls);
        }
    });

    test("preserves the historical Storage 404 and other Storage failures", async () => {
        for (const [status, message, expected] of [
            [404, "missing object", { status: 404, body: { error: "product image not found" } }],
            [
                503,
                "storage temporarily unavailable",
                {
                    status: 502,
                    body: { error: "storage temporarily unavailable" },
                },
            ],
        ] as const) {
            useEvidenceResponder({
                storage: { downloadStatus: status, message },
            });
            const response = await requestCommerce(`/me/order/claim/evidence?evidenceId=${evidenceRow.id}`, {
                userId: "buyer-evidence-17",
            });

            expect({ status: response.status, body: await response.json() }).toEqual(expected);
        }
    });
});

function resource(call: { url: string; method: string }): string {
    return call.url.includes("/storage/v1/object/")
        ? `storage:${call.method}`
        : new URL(call.url).pathname.split("/").at(-1)!;
}
