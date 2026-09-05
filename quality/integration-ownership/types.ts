export type IntegrationOwnershipConfidence = "high" | "review";

export type IntegrationOwnershipEvidence =
    | "official-package-dependency"
    | "official-package-import"
    | "integration-authoring-path"
    | "integration-kind"
    | "integration-resource"
    | "owned-dependent"
    | "owned-support";

export type IntegrationIdentifierCategory =
    | "artifact-id"
    | "bloc-tag"
    | "dashboard-id"
    | "endpoint-id"
    | "function-id"
    | "resource-id"
    | "source-id"
    | "trigger-id";

export interface IntegrationIdentifierOwner {
    category: IntegrationIdentifierCategory;
    kind: string;
}

export interface IntegrationDescriptor {
    kind: string;
    root: string;
}

export interface IntegrationCatalog {
    authoringRoot: string;
    descriptors: readonly IntegrationDescriptor[];
    identifiers: ReadonlyMap<string, readonly IntegrationIdentifierOwner[]>;
    packageRoot: string;
}

export interface IntegrationOwnershipFinding {
    confidence: IntegrationOwnershipConfidence;
    evidence: IntegrationOwnershipEvidence;
    file: string;
    line?: number;
    message: string;
    owners: readonly string[];
}

export interface IntegrationOwnershipAudit {
    catalog: IntegrationCatalog;
    findings: readonly IntegrationOwnershipFinding[];
}
