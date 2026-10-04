import type { DashboardNavigationItem } from "@bernouy/cms-dashboards";
import type { CollectionTranslationKey } from "./CollectionRelease";

/** A collection-owned dashboard template. Site activation and membership are separate. */
export interface CollectionDashboard {
    readonly id: string;
    readonly generation?: number;
    readonly name: CollectionTranslationKey;
    readonly icon?: string;
    readonly description?: CollectionTranslationKey;
    readonly navigation: readonly CollectionDashboardNavigationItem[];
}

export type CollectionDashboardNavigationItem = Omit<DashboardNavigationItem, "label" | "children"> & {
    readonly label: CollectionTranslationKey;
    readonly children?: readonly CollectionDashboardNavigationItem[];
};
