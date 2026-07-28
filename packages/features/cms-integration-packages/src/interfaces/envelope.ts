import type { CanonicalFile, CanonicalFileEncoding, CanonicalFileSetLimits } from "./fileSet";

export const INTEGRATION_PACKAGE_SCHEMA = "cms.integration.package.v1" as const;

export type IntegrationPackageFileEncoding = CanonicalFileEncoding;

export type IntegrationPackageFileV1 = CanonicalFile;

export interface IntegrationPackageEnvelopeV1 {
    schema: typeof INTEGRATION_PACKAGE_SCHEMA;
    kind: string;
    version: string;
    definition: string;
    releaseNotes?: string;
    files: Record<string, IntegrationPackageFileV1>;
}

export type IntegrationPackageLimits = CanonicalFileSetLimits;

export interface IntegrationPackageValidationOptions {
    limits?: Partial<IntegrationPackageLimits>;
    requireReleaseNotes?: boolean;
}
