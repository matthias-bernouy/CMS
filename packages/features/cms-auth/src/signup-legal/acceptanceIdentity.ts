import type { SignupLegalAcceptance, SignupLegalDocumentEvidence } from "cms-auth/signup-legal/contracts";

export async function signupLegalAcceptanceId(
    cmsUserId: string,
    documents: readonly SignupLegalDocumentEvidence[],
): Promise<string> {
    const digest = await sha256Hex(
        JSON.stringify({
            schema: "cms-signup-legal-acceptance-v1",
            cmsUserId,
            versionIds: documents.map((document) => document.versionId).sort(),
        }),
    );
    return `signup-legal-v1:${digest}`;
}

export function sameSignupLegalAcceptancePayload(
    existing: SignupLegalAcceptance,
    candidate: SignupLegalAcceptance,
): boolean {
    return JSON.stringify(proofPayload(existing)) === JSON.stringify(proofPayload(candidate));
}

function proofPayload(acceptance: SignupLegalAcceptance): unknown {
    return {
        cmsUserId: acceptance.cmsUserId,
        documents: acceptance.documents
            .map((document) => ({
                documentKey: document.documentKey,
                versionId: document.versionId,
                label: document.label,
                consentText: document.consentText,
                pageSnapshot: {
                    id: document.pageSnapshot.id,
                    path: document.pageSnapshot.path,
                    title: document.pageSnapshot.title,
                    description: document.pageSnapshot.description,
                    content: document.pageSnapshot.content,
                },
                pageSnapshotCanonical: document.pageSnapshotCanonical,
                contentHash: document.contentHash,
            }))
            .sort((left, right) => left.versionId.localeCompare(right.versionId)),
    };
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
