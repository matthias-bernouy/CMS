import type {
    IntegrationDefinition,
    IntegrationImportDto,
    IntegrationInstallationStatus,
} from "@bernouy/cms-integrations";

export type IntegrationInstallationRow = {
    id: string;
    label: string;
    definitionVersion: string;
    packageDigest?: string;
    status: IntegrationInstallationStatus;
    runCount: number;
    artifactCount: number;
    missingArtifactCount: number;
    updatedAt: string;
};

export type IntegrationUpgradeVersions = {
    id: string;
    current: string;
    stable?: string;
    latest?: string;
    versions: string[];
    targets?: IntegrationUpgradeTarget[];
};

export type IntegrationUpgradeTarget = {
    version: string;
    eligible: boolean;
    evidence: "composite" | "legacy-index";
    freshInstallOnly: boolean;
    releaseLevel?: string;
    packageDigest?: string;
    reasons: string[];
    migrations: Array<{
        connectorKey: string;
        lineageId: string;
        supportedSourceRange: string;
        rollback: string;
        pointOfNoReturn: string;
        cmsMediatedCutover: string;
        providerDirectCutover: string;
        cmsDrainSeconds?: number;
        providerDrainSeconds?: number;
        downtimeStatus?: string;
        observedDowntimeSeconds?: number;
        rollbackVerified?: boolean;
        pointOfNoReturnObservation?: string;
        cleanupObserved?: boolean;
        cleanupDelaySeconds?: number;
    }>;
};

export type IntegrationImportPayload = Omit<IntegrationImportDto, "options"> & {
    options?: IntegrationImportDto["options"];
    definition?: IntegrationDefinition;
};

export type BrowserTab = "installed" | "catalogue";

export type SetupResourceRow = {
    type: string;
    label: string;
    detail: string;
};

export type BoundDataWaiter = {
    predicate: () => boolean;
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

export type IntegrationBrowserHost = HTMLElement & {
    definitions: IntegrationDefinition[];
    installations: IntegrationInstallationRow[];
    activeDefinition: IntegrationDefinition | null;
    definitionsLoaded: boolean;
    installationsLoaded: boolean;
    observer: MutationObserver | null;
    waiters: BoundDataWaiter[];
    tab: BrowserTab;
    selectedIntegrationId: string;
    query<T extends Element>(selector: string): T;
    renderAll(): void;
    setTab(tab: BrowserTab): void;
    openDetail(integrationId: string): void;
    openSetup(definition: IntegrationDefinition, options?: { answers?: Record<string, unknown>; error?: string }): void;
    closeDetail(): void;
    waitForBoundData(predicate: () => boolean, timeoutMs?: number): Promise<void>;
};

export type {
    IntegrationAnswerValue,
    IntegrationDefinition,
    IntegrationInput,
} from "@bernouy/cms-integrations";
