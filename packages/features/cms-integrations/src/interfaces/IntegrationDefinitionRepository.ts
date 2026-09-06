import type { IntegrationDefinition, IntegrationIcon, IntegrationCover } from "./Integration";
import type { IntegrationType } from "./IntegrationResources";

export type IntegrationAsset = {
    bytes: Uint8Array;
    contentType: string;
};

export type IntegrationDefinitionVersion = {
    version: string;
    path: string;
    definition: string;
    verificationDigest?: string;
    status?: "blocked" | "inadmissible" | "unverified";
};

export type IntegrationDefinitionIndex = {
    schema?: string;
    kind: string;
    label: string;
    type?: IntegrationType;
    icon?: IntegrationIcon;
    cover?: IntegrationCover;
    category?: string;
    description?: string;
    stable?: string;
    latest?: string;
    versions: IntegrationDefinitionVersion[];
};

export type IntegrationDefinitionSummary = Omit<IntegrationDefinitionIndex, "versions"> & {
    versions: string[];
};

export type IntegrationDefinitionRepository = {
    list(): Promise<IntegrationDefinitionSummary[]>;
    getIndex(kind: string): Promise<IntegrationDefinitionIndex | null>;
    listVersions(kind: string): Promise<IntegrationDefinitionVersion[]>;
    get(kind: string, version?: string): Promise<IntegrationDefinition | null>;
    getAsset?(kind: string, version: string | undefined, path: string): Promise<IntegrationAsset | null>;
};
