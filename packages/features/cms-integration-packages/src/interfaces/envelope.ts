export const INTEGRATION_PACKAGE_SCHEMA = "cms.integration.package.v1" as const;

export type IntegrationPackageFileEncoding = "utf8" | "base64";

export interface IntegrationPackageFileV1 {
    encoding: IntegrationPackageFileEncoding;
    content: string;
}

export interface IntegrationPackageEnvelopeV1 {
    schema: typeof INTEGRATION_PACKAGE_SCHEMA;
    kind: string;
    version: string;
    definition: string;
    releaseNotes?: string;
    files: Record<string, IntegrationPackageFileV1>;
}

export interface IntegrationPackageLimits {
    maxDepth: number;
    maxDirectories: number;
    maxFiles: number;
    maxFileBytes: number;
    maxDecodedBytes: number;
    maxDocumentBytes: number;
    maxPathBytes: number;
    maxSegmentBytes: number;
}

export interface IntegrationPackageValidationOptions {
    limits?: Partial<IntegrationPackageLimits>;
    requireReleaseNotes?: boolean;
}
