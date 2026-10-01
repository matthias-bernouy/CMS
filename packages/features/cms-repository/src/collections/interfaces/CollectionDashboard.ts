import type { DashboardNavigationItem } from "@bernouy/cms-dashboards";

/** A collection-owned dashboard template. Site activation and membership are separate. */
export interface CollectionDashboard {
    readonly id: string;
    readonly name: string;
    readonly icon?: string;
    readonly description?: string;
    readonly navigation: readonly CollectionDashboardNavigationItem[];
    /** Contracts used by this dashboard, for source discovery. */
    readonly contracts?: readonly string[];
}

export type CollectionDashboardNavigationItem = DashboardNavigationItem;
