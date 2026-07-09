import type {
    DashboardBinding,
    DashboardColumn,
    DashboardDataRef,
    DashboardEndpointRef,
    DashboardExpr,
    DashboardFilter,
    DashboardMeta,
} from "./refs";
import type { DashboardSection } from "./fields";

export type DashboardAction = {
    id: string;
    label: string;
    icon?: string;
    tone?: "primary" | "secondary" | "danger";
    placement?: "primary" | "secondary" | "more";
    section?: string;
    endpoint?: DashboardEndpointRef;
    download?: {
        filename?: string;
    };
    selection?: { opens?: string };
    after?: {
        opens: string;
        row?: DashboardExpr;
    };
    confirm?: string;
};

export type DashboardWidget =
    | {
        widget: "w-table";
        id: string;
        title?: string;
        source: DashboardDataRef;
        rowKey: string;
        columns: DashboardColumn[];
        filters?: DashboardFilter[];
        pageSize?: number;
        selection?: { opens?: string };
        actions?: DashboardAction[];
    }
    | {
        widget: "w-detail";
        id: string;
        source: DashboardDataRef;
        title?: DashboardBinding;
        status?: DashboardBinding;
        actions?: DashboardAction[];
        main: DashboardSection[];
        aside?: DashboardSection[];
    }
    | {
        widget: "w-section";
        id: string;
        title: string;
        description?: string;
        children: DashboardWidget[];
    }
    | {
        widget: "w-tabs";
        id: string;
        tabs: Array<{ id: string; label: string; children: DashboardWidget[] }>;
    };

export type DashboardDefinition = {
    id: string;
    meta?: DashboardMeta;
    source: string;
    views: DashboardWidget[];
    requires?: string;
};

export type DashboardDto = DashboardDefinition;
export type Dashboard = DashboardDefinition;
