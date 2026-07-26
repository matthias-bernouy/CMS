import type { IntegrationRegistryCatalogSnapshot } from "./catalog";

export type IntegrationRegistryRecoveryDiagnosticCode =
    | "publication-replayed"
    | "publication-quarantined"
    | "abandoned-staging-quarantined"
    | "orphan-version-quarantined";

export type IntegrationRegistryRecoveryDiagnostic = Readonly<{
    code: IntegrationRegistryRecoveryDiagnosticCode;
    source: string;
    message: string;
    operationId?: string;
    kind?: string;
    version?: string;
}>;

export type IntegrationRegistryRecoveryResult = Readonly<{
    snapshot: IntegrationRegistryCatalogSnapshot;
    diagnostics: readonly IntegrationRegistryRecoveryDiagnostic[];
}>;

export interface IntegrationRegistryRecoverer {
    recover(): Promise<IntegrationRegistryRecoveryResult>;
}
