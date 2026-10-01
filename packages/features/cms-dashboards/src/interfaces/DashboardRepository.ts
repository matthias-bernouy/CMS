export interface DashboardMount {
    readonly collectionId: string;
    readonly viewId: string;
    readonly label: string;
}

export interface DashboardNavigationItem {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    /** Exact installed collection and view identity, omitted for a group. */
    readonly use?: string;
    /** How children of this item appear when it is selected. */
    readonly childPlacement?: "lateral" | "tabs";
    readonly children?: readonly DashboardNavigationItem[];
}

export interface CollectionDashboardOrigin {
    readonly kind: "collection";
    readonly publisherId: string;
    readonly collectionId: string;
    readonly dashboardId: string;
}

/** Site-owned navigation over collection-owned HTML views. */
export interface DashboardRecord {
    readonly id: string;
    readonly siteId: string;
    readonly name: string;
    readonly icon?: string;
    readonly enabled: boolean;
    readonly revision: number;
    /** Historical flat records; new writes store navigation only. */
    readonly mounts?: readonly DashboardMount[];
    readonly navigation?: readonly DashboardNavigationItem[];
    readonly origin?: CollectionDashboardOrigin;
    readonly collectionName?: string;
    readonly description?: string;
    readonly sourceContracts?: readonly string[];
}

export interface DashboardRepository {
    list(siteId: string): Promise<DashboardRecord[]>;
    get(siteId: string, id: string): Promise<DashboardRecord | null>;
    create(record: DashboardRecord): Promise<void>;
    replace(record: DashboardRecord, expectedRevision: number): Promise<boolean>;
    delete(siteId: string, id: string, expectedRevision: number): Promise<boolean>;
}
