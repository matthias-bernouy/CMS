export const activeClaimRow = {
    id: 4_294_967_307,
    public_id: "40000000-0000-4000-8000-000000000007",
    buyer_cms_user_id: "buyer-evidence-17",
    seller_id: 4_294_967_304,
    status: "under_review",
};

export const resolvedClaimRow = {
    ...activeClaimRow,
    id: 4_294_967_308,
    public_id: "40000000-0000-4000-8000-000000000008",
    status: "resolved_buyer",
};

export const sellerRow = {
    cms_user_id: "seller-evidence-4",
};

export const evidenceRow = {
    id: 4_294_967_333,
    claim_id: activeClaimRow.id,
    submitted_by_kind: "seller",
    storage_bucket: "commerce-claim-evidence",
    storage_path: `claims/${activeClaimRow.public_id}/seller/adverse-proof.pdf`,
    mime_type: "application/pdf",
};

export const attachedEvidence = {
    id: evidenceRow.id,
    claimId: activeClaimRow.id,
    submittedByKind: "buyer",
    storage_bucket: "commerce-claim-evidence",
    storage_path: "must-not-leak",
    mimeType: "application/pdf",
    fileSize: 34,
    originalFilename: "folder_proof.pdf",
    sha256: "d8b2685f1c4a9fb1b31bccdda3e29a6b82f60e752f1a9351a917048c3dd0fd2f",
    description: "Opening proof",
    metadata: { upload: "edge_multipart_v1" },
    createdAt: "2026-07-17T11:00:00.000Z",
    futurePrivateField: "must-not-leak",
};

export const evidenceContents = "%PDF-1.4 private evidence contents";

export function evidenceForm(options: {
    contents?: string | Uint8Array;
    description?: string | null;
    filename?: string;
    type?: string;
} = {}): FormData {
    const form = new FormData();
    form.set("file", new File(
        [options.contents ?? evidenceContents],
        options.filename ?? "proof.pdf",
        { type: options.type ?? "application/pdf" },
    ));
    if (options.description !== null) {
        form.set("description", options.description ?? "Opening proof");
    }
    return form;
}
