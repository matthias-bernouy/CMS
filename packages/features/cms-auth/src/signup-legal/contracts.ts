export type SignupLegalPageSnapshot = {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
};

export type SignupLegalDocumentDefinition = {
    key: string;
    label: string;
    consentText: string;
    pageId: string;
    enabled: boolean;
};

export type ResolvedSignupLegalPage = {
    snapshot: SignupLegalPageSnapshot;
    /** Canonical server serialization produced by the CMS content aggregate. */
    canonicalSnapshot: string;
};

export type SignupLegalRequirement = {
    documentKey: string;
    versionId: string;
    label: string;
    consentText: string;
    page: Pick<SignupLegalPageSnapshot, "id" | "path" | "title">;
    contentHash: string;
};

export type SignupLegalRequirements = {
    documents: SignupLegalRequirement[];
};

export type SignupLegalDocumentEvidence = {
    documentKey: string;
    versionId: string;
    label: string;
    consentText: string;
    pageSnapshot: SignupLegalPageSnapshot;
    pageSnapshotCanonical: string;
    contentHash: string;
};

export type PreparedSignupLegalAcceptance = {
    documents: SignupLegalDocumentEvidence[];
};

export type SignupLegalAcceptance = PreparedSignupLegalAcceptance & {
    id: string;
    cmsUserId: string;
    acceptedAt: Date;
};

export interface SignupLegalAcceptanceStore {
    /**
     * Append one immutable proof event. An exact deterministic-id retry is a
     * success; contradictory evidence under that id must fail.
     */
    append(acceptance: SignupLegalAcceptance): Promise<void>;
    listForUser(cmsUserId: string): Promise<SignupLegalAcceptance[]>;
}

export interface SignupLegalAcceptancePolicy {
    requirements(): Promise<SignupLegalRequirements>;
    prepare(acceptedVersionIds: readonly string[]): Promise<PreparedSignupLegalAcceptance>;
    record(prepared: PreparedSignupLegalAcceptance, cmsUserId: string): Promise<void>;
}
