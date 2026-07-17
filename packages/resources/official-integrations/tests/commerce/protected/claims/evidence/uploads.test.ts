import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useEvidenceResponder } from "./fixtures";
import {
    activeClaimRow,
    attachedEvidence,
    evidenceContents,
    evidenceForm,
} from "./raw";

installCommerceTestEnvironment();

describe("commerce claim evidence upload contracts", () => {
    test("preserves the exact private buyer upload response and Storage request", async () => {
        useEvidenceResponder();
        const response = await requestCommerce(
            `/me/order/claim/evidence?claimId=${activeClaimRow.id}`,
            {
                userId: "buyer-evidence-17",
                formData: evidenceForm({
                    description: "  Opening proof  ",
                    filename: "folder/proof.pdf",
                }),
            },
        );
        const body = await response.json();
        const calls = capturedFetches();
        const storage = calls.find(call => call.url.includes("/storage/v1/object/"))!;
        const attach = expectRpc("attach_marketplace_claim_evidence");
        const storagePath = objectPath(storage.url);

        expect(response.status).toBe(201);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(body).toEqual({
            id: attachedEvidence.id,
            claimId: activeClaimRow.id,
            submittedByKind: "buyer",
            mimeType: "application/pdf",
            fileSize: evidenceContents.length,
            originalFilename: "folder_proof.pdf",
            sha256: attachedEvidence.sha256,
            description: "Opening proof",
            metadata: { upload: "edge_multipart_v1" },
            createdAt: attachedEvidence.createdAt,
        });
        expect(storage.method).toBe("POST");
        expect(storage.headers.get("apikey")).toBe("sb_secret_test");
        expect(storage.headers.get("authorization")).toBeNull();
        expect(storage.headers.get("cache-control")).toBe("31536000");
        expect(storage.headers.get("content-type")).toBe("application/pdf");
        expect(storage.headers.get("x-upsert")).toBe("false");
        expect(storagePath).toMatch(new RegExp(
            `^claims/${activeClaimRow.public_id}/buyer/[0-9a-f-]+\\.pdf$`,
        ));
        expect(attach.body).toEqual({
            p_claim_id: activeClaimRow.id,
            p_submitted_by_kind: "buyer",
            p_submitted_by: "buyer-evidence-17",
            p_storage_bucket: "commerce-claim-evidence",
            p_storage_path: storagePath,
            p_mime_type: "application/pdf",
            p_file_size: evidenceContents.length,
            p_original_filename: "folder_proof.pdf",
            p_sha256: attachedEvidence.sha256,
            p_description: "Opening proof",
            p_metadata: { upload: "edge_multipart_v1" },
        });
    });

    test("keeps the seller actor and nullable description through persistence", async () => {
        useEvidenceResponder();
        const response = await requestCommerce(
            `/me/sale/claim/evidence?claimId=${activeClaimRow.id}`,
            {
                userId: "seller-evidence-4",
                formData: evidenceForm({ description: null }),
            },
        );
        const body = await response.json();
        const attach = expectRpc("attach_marketplace_claim_evidence");

        expect(response.status).toBe(201);
        expect(body).toEqual({
            id: attachedEvidence.id,
            claimId: activeClaimRow.id,
            submittedByKind: "seller",
            mimeType: "application/pdf",
            fileSize: evidenceContents.length,
            originalFilename: "proof.pdf",
            sha256: attachedEvidence.sha256,
            description: null,
            metadata: { upload: "edge_multipart_v1" },
            createdAt: attachedEvidence.createdAt,
        });
        expect(attach.body).toMatchObject({
            p_submitted_by_kind: "seller",
            p_submitted_by: "seller-evidence-4",
            p_description: null,
        });
        expect(String(attach.body.p_storage_path)).toContain("/seller/");
    });

    test("keeps Storage outside persistence and removes an orphan after attach failure", async () => {
        useEvidenceResponder({
            failure: {
                resource: "attach_marketplace_claim_evidence",
                message: "claim changed during evidence upload",
            },
        });
        const response = await requestCommerce(
            `/me/order/claim/evidence?claimId=${activeClaimRow.id}`,
            {
                userId: "buyer-evidence-17",
                formData: evidenceForm(),
            },
        );
        const calls = capturedFetches();
        const storage = calls.filter(call => call.url.includes("/storage/v1/object/"));

        expect({ status: response.status, body: await response.json() }).toEqual({
            status: 502,
            body: { error: "claim changed during evidence upload" },
        });
        expect(calls.map(callKind)).toEqual([
            "marketplace_claims", "storage:POST",
            "attach_marketplace_claim_evidence", "storage:DELETE",
        ]);
        expect(storage).toHaveLength(2);
        expect(storage[1]!.url).toBe(storage[0]!.url);
    });
});

function objectPath(url: string): string {
    const marker = "/storage/v1/object/commerce-claim-evidence/";
    return new URL(url).pathname.slice(marker.length)
        .split("/")
        .map(decodeURIComponent)
        .join("/");
}

function callKind(call: { url: string; method: string }): string {
    return call.url.includes("/storage/v1/object/")
        ? `storage:${call.method}`
        : new URL(call.url).pathname.split("/").at(-1)!;
}
