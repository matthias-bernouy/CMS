export type JsonRecord = Record<string, unknown>;

export type PublishedPage = {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
};

export type VerifiedConsentDocument = {
    key: string;
    label: string;
    consentText: string;
    publishedSnapshotUrl: string;
    page: PublishedPage;
    contentHash: string;
};
