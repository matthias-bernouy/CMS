import type {
    IntegrationDefinition,
    IntegrationImportDto,
    IntegrationInstanceStatus,
} from "@bernouy/cms-integrations";

export type IntegrationInstanceRow = {
    id: string;
    kind: string;
    label: string;
    status: IntegrationInstanceStatus;
    runCount: number;
    artifactCount: number;
    missingArtifactCount: number;
    updatedAt: string;
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
    instances: IntegrationInstanceRow[];
    activeDefinition: IntegrationDefinition | null;
    definitionsLoaded: boolean;
    instancesLoaded: boolean;
    observer: MutationObserver | null;
    waiters: BoundDataWaiter[];
    tab: BrowserTab;
    selectedInstanceId: string;
    query<T extends Element>(selector: string): T;
    renderAll(): void;
    setTab(tab: BrowserTab): void;
    openDetail(instanceId: string): void;
    openSetup(definition: IntegrationDefinition, options?: { answers?: Record<string, unknown>; error?: string }): void;
    closeDetail(): void;
    waitForBoundData(predicate: () => boolean, timeoutMs?: number): Promise<void>;
};

export type {
    IntegrationAnswerValue,
    IntegrationDefinition,
    IntegrationInput,
} from "@bernouy/cms-integrations";
