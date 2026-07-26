import type { IntegrationRegistryCatalogSnapshot } from "../../../../../interfaces/catalog";

export type FsReleaseReportStream = "compatibility" | "verification" | "migration" | "decision";

export type FsReleaseVersionKey = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type FsReleaseReportIdentified<T> = Readonly<{
    report: T;
    canonicalBytes: Uint8Array;
    digest: string;
}>;

export type FsReleaseReportHistoryLink = Readonly<{
    revisionType: "root" | "revision";
    createdAt: string;
    supersedes?: string;
}>;

export type FsReleaseReportHistoryAdapter<T, K> = Readonly<{
    stream: FsReleaseReportStream;
    identify(value: unknown): Promise<FsReleaseReportIdentified<T>>;
    parseKey(value: unknown): K;
    key(report: T): K;
    revisionId(report: T): string;
    historyFields(report: T): FsReleaseReportHistoryLink;
    assertFollows(previous: T, next: T): void;
    assertCatalog(snapshot: IntegrationRegistryCatalogSnapshot, report: T): void;
    mutationKind(key: K): string;
}>;

export type FsReleaseReportRevisionDocument<T> = Readonly<{
    ordinal: number;
    reportDigest: string;
    report: T;
}>;
