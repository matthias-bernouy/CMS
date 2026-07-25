import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";

export type IntegrationRegistryCatalogHealth = "healthy" | "degraded";

export type IntegrationRegistryDiagnosticStage = "discovery" | "index" | "version" | "package" | "identity";

export type IntegrationRegistryDiagnosticCode =
    | "invalid-structure"
    | "invalid-integration"
    | "invalid-version"
    | "invalid-package"
    | "duplicate-kind"
    | "duplicate-version-identity";

export type IntegrationRegistryCatalogDiagnostic = Readonly<{
    code: IntegrationRegistryDiagnosticCode;
    stage: IntegrationRegistryDiagnosticStage;
    source: string;
    message: string;
    kind?: string;
    version?: string;
}>;

export type IntegrationRegistryQuarantinedEntry = Readonly<{
    source: string;
    diagnosticCodes: readonly IntegrationRegistryDiagnosticCode[];
    kind?: string;
}>;

export type IntegrationRegistryPackageMetadata = Readonly<{
    schema: "cms.integration.package.v1";
    digest: string;
    canonicalBytes: number;
    decodedBytes: number;
    files: number;
}>;

export type IntegrationRegistryExactVersionLocation = Readonly<{
    kind: string;
    version: string;
    packageRoot: string;
    definition: string;
    releaseNotes?: string;
    legacy?: boolean;
    package: IntegrationRegistryPackageMetadata;
}>;

export type IntegrationRegistryValidatedCatalogEntry = Readonly<{
    source: string;
    index: IntegrationDefinitionIndex;
    versions: readonly IntegrationRegistryExactVersionLocation[];
}>;

export type CreateIntegrationRegistryCatalogSnapshotInput = Readonly<{
    entries: readonly IntegrationRegistryValidatedCatalogEntry[];
    diagnostics?: readonly IntegrationRegistryCatalogDiagnostic[];
    quarantined?: readonly IntegrationRegistryQuarantinedEntry[];
}>;

export type IntegrationRegistryCatalogSnapshot = Readonly<{
    health: IntegrationRegistryCatalogHealth;
    summaries: readonly IntegrationDefinitionSummary[];
    diagnostics: readonly IntegrationRegistryCatalogDiagnostic[];
    quarantined: readonly IntegrationRegistryQuarantinedEntry[];
    getIndex(kind: string): IntegrationDefinitionIndex | null;
    listVersions(kind: string): readonly IntegrationDefinitionVersion[];
    locateExactVersion(kind: string, version: string): IntegrationRegistryExactVersionLocation | null;
}>;
