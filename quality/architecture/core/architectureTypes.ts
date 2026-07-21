export const WORKSPACE_LAYERS = ["foundation", "features", "resources", "surfaces", "runtimes"] as const;

export type WorkspaceLayer = (typeof WORKSPACE_LAYERS)[number];

export type ArchitectureViolationKind =
    | "reversed-layer-dependency"
    | "workspace-cycle"
    | "undeclared-subpath"
    | "cross-package-source-import"
    | "surface-runtime-adapter"
    | "browser-runtime-adapter"
    | "environment-read"
    | "focused-test"
    | "generated-asset-drift";

export interface ArchitectureViolation {
    kind: ArchitectureViolationKind;
    message: string;
    file?: string;
    line?: number;
}

export interface GeneratedAssetCheck {
    path: string;
    generate: () => Promise<string>;
    normalize?: (contents: string) => string;
}

export interface WorkspaceCheckOptions {
    rootDir: string;
    /** Repository-relative paths ignored by all source scans. */
    ignoredPaths?: readonly string[];
    /** Extra repository-relative browser entrypoints, including generated bundles. */
    browserEntryPaths?: readonly string[];
    /** Existing non-runtime reads. Counts are a ratchet: missing reads are fine, extra reads fail. */
    environmentReadBaseline?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    generatedAssets?: readonly GeneratedAssetCheck[];
    adapterSubpaths?: readonly string[];
    infrastructureModules?: readonly string[];
}

export interface PackageManifest {
    name?: string;
    exports?: unknown;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

export interface WorkspacePackage {
    name: string;
    layer: WorkspaceLayer;
    root: string;
    relativeRoot: string;
    manifest: PackageManifest;
    sourceFiles: string[];
    pathAliases: PackagePathAlias[];
}

export interface PackagePathAlias {
    pattern: string;
    targets: string[];
    baseDir: string;
}

export interface SourceImport {
    specifier: string;
    line: number;
    typeOnly: boolean;
}

export const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

export const DEFAULT_ADAPTER_SUBPATHS = [
    "fs",
    "http",
    "mongo",
    "mongodb",
    "node",
    "postgres",
    "postgresql",
    "redis",
    "s3",
    "supabase",
];

export const DEFAULT_INFRASTRUCTURE_MODULES = ["mongodb", "pg", "postgres", "redis", "ioredis", "minio", "mysql2"];

export const IGNORED_DIRECTORY_NAMES = new Set([".git", ".coverage-rate", "coverage", "dist", "node_modules"]);
