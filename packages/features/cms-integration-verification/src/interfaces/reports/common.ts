export type ReportOrigin = "admission" | "legacy-backfill";

export type ReportProvenance = Readonly<{
    actor: string;
    reason: string;
    evidenceIds?: readonly string[];
}>;

export type ReportHistoryFields = Readonly<{
    reportId: string;
    revisionType: "root" | "revision";
    origin: ReportOrigin;
    createdAt: string;
    supersedes?: string;
}>;

export type VersionDigestReference = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type ReportRevisionDigestReference = Readonly<{
    revisionId: string;
    reportDigest: string;
}>;

export type DigestContractReference = Readonly<{
    contractId: string;
    ownerVersion: string;
    digest: string;
}>;
