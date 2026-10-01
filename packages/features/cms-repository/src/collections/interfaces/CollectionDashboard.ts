/** A collection-owned dashboard template. Site activation and membership are separate. */
export interface CollectionDashboard {
    readonly id: string;
    readonly name: string;
    readonly icon?: string;
    readonly description?: string;
    /** Historical flat navigation. New definitions use navigation. */
    readonly views?: readonly CollectionDashboardView[];
    readonly navigation?: readonly CollectionDashboardNavigationItem[];
    /** Contracts used by this dashboard, for source discovery. */
    readonly contracts?: readonly string[];
}

export interface CollectionDashboardNavigationItem {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly use?: string;
    readonly childPlacement?: "lateral" | "tabs";
    readonly children?: readonly CollectionDashboardNavigationItem[];
}

export interface CollectionDashboardView {
    readonly viewId: string;
    readonly label: string;
}
