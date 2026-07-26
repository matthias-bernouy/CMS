export type FsIntegrationRegistryCandidateRecoveryDiagnostic = Readonly<{
    code: "quarantined_candidate" | "quarantined_object" | "quarantined_temporary" | "lease_recovered" | "expired";
    path: string;
    message: string;
}>;

export type FsIntegrationRegistryCandidateRecoveryResult = Readonly<{
    diagnostics: readonly FsIntegrationRegistryCandidateRecoveryDiagnostic[];
    recoveredLeases: number;
    expiredCandidates: number;
    quarantinedEntries: number;
}>;

export type RecoverFsIntegrationRegistryCandidatesConfig = Readonly<{
    root: string;
    now: string;
    temporaryGraceMs?: number;
}>;
