export type RepositoryManagementOperationalReadSource = Readonly<{
    snapshot(): unknown;
    filesystemCapacity(): Promise<unknown>;
}>;

export type RepositoryManagementSnapshotMetric = Readonly<{
    integrations: number;
    versions: number;
    diagnostics: number;
    quarantined: number;
    recoveryDiagnostics: number;
}>;
