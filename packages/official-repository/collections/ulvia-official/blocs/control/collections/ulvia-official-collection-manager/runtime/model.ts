export type ReleaseReference = {
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
};

export type CatalogueRelease = ReleaseReference & {
    name: string;
    description: string;
    blocCount: number;
    hasTheme: boolean;
};

export type InstalledCollection = {
    collectionId: string;
    publisherId: string;
    version: string;
    digest: string;
    repositoryId?: string;
    configurable: boolean;
};

export type Catalogue = {
    revision: number;
    repositories: string[];
    releases: CatalogueRelease[];
    installed: InstalledCollection[];
};

export type CollectionDetail = InstalledCollection & {
    name: string;
    description: string;
    revision: number;
    configurationJson: string;
    dataGeneration: number;
    blocCount: number;
    pageCount: number;
    assetCount: number;
    textCount: number;
    themeTokenCount: number;
    overriddenLocaleCount: number;
    blocs: {
        id: string;
        label: string;
        description: string;
        generation: number;
        internal: boolean;
        surfaces: ("control" | "delivery")[];
    }[];
};

export type MigrationPlan = {
    expectedRevision: number;
    planDigest: string;
    targets: { collectionId: string; fromDigest: string; toDigest: string }[];
    totalPages: number;
    operationCount: number;
    blockedReasons: string[];
};

export type OperationItem = {
    id: string;
    contractId: string;
    capabilityId: string;
    status: "queued" | "running" | "succeeded" | "failed";
    createdAt: string;
    updatedAt: string;
    errorCode?: string;
};

export type Operations = {
    items: OperationItem[];
};

export type OperationalStatus = {
    core: "ready";
    maintenance: boolean;
    activeMigration?: { id: string; status: string; updatedAt: string };
};

export function releaseAction(
    release: CatalogueRelease,
    installed: InstalledCollection[],
): "install" | "upgrade" | "current" | "older" {
    const current = installed.find(({ collectionId }) => collectionId === release.collectionId);
    if (!current) {
        return "install";
    }
    if (current.digest === release.digest) {
        return "current";
    }
    return compareVersions(release.version, current.version) > 0 ? "upgrade" : "older";
}

function compareVersions(left: string, right: string): number {
    const a = left.split(/[.-]/).slice(0, 3).map(Number);
    const b = right.split(/[.-]/).slice(0, 3).map(Number);
    for (let index = 0; index < 3; index += 1) {
        if ((a[index] ?? 0) !== (b[index] ?? 0)) {
            return (a[index] ?? 0) - (b[index] ?? 0);
        }
    }
    return left.localeCompare(right);
}
