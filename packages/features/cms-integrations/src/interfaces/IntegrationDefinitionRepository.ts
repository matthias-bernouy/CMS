import type { IntegrationDefinition } from "./Integration";

export type IntegrationDefinitionVersion = {
    version: string;
    path: string;
    definition: string;
};

export type IntegrationDefinitionIndex = {
    schema?: string;
    kind: string;
    label: string;
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
};
