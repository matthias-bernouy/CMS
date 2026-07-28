import type { IntegrationPackageLimits } from "../../../interfaces/envelope";

export type ExpectedIntegrationPackageIdentity = {
    kind?: string;
    version?: string;
    digest?: string;
};

export type ImmutableIntegrationPackageIdentity = {
    kind: string;
    version: string;
    digest: string;
};

export type WriteImmutableIntegrationPackageDirectoryOptions = {
    /**
     * An absolute, absent staging path whose immediate parent already exists.
     * The writer never renames this directory into a live registry location.
     */
    destination: string;
    expected: ImmutableIntegrationPackageIdentity;
    limits?: Partial<IntegrationPackageLimits>;
};
