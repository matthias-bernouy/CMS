export type HealthTone = "good" | "warning" | "danger" | "neutral";

export type HealthRow = {
    name: string;
    detail: string;
    state: string;
    tone: HealthTone;
    href: string;
};

export type Provider = {
    id: string;
    providerId: string;
    accountId: string;
    status: string;
    observedAt: string | null;
    contracts: { contractId: string; version: string; digest: string; status: string }[];
};

export type Selection = { installationId: string; contractId: string; version: string; digest: string };
export type Providers = { installations: Provider[]; selected: Selection[] };
export type Catalogue = { available: { id: string; kind: string; version: string; digest: string }[] };
export type Collections = {
    installed: { collectionId: string; version: string }[];
    releases: { collectionId: string; version: string }[];
};
export type Dashboards = {
    dashboards: { id: string; name: string; enabled: boolean; members: string[]; origin?: unknown }[];
};

export type HealthReport = {
    providers: HealthRow[];
    sources: HealthRow[];
    collections: HealthRow[];
    dashboards: HealthRow[];
    issues: number;
};
