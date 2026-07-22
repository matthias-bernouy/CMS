export type DefinitionBundleLimits = {
    maxDepth: number;
    maxFiles: number;
    maxBytes: number;
};

export type DefinitionSource = {
    file: string;
    pointer: string;
};

export type ResolvedDefinitionFile = {
    provenance: Map<string, DefinitionSource>;
    value: unknown;
};

export type DefinitionBundleState = {
    activeFiles: string[];
    bytesRead: number;
    filesRead: number;
    limits: DefinitionBundleLimits;
    versionRoot: string;
};
