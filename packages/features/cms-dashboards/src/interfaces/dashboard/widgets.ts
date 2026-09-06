import type {
    DashboardBinding,
    DashboardColumn,
    DashboardDataRef,
    DashboardEndpointRef,
    DashboardExpr,
    DashboardFilter,
    DashboardMeta,
    DashboardVisibilityRule,
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
    management?: { installationId: string; action: "save-settings"; body?: Record<string, DashboardExpr> };
    download?: {
        filename?: string;
    };
    selection?: { opens?: string };
    after?: {
        opens?: string;
        row?: DashboardExpr;
        resource?: DashboardExpr;
    };
    confirm?: string;
    visibleWhen?: DashboardVisibilityRule;
};

export type DashboardNavigationListWidget = {
    widget: "w-navigation-list";
    id: string;
    title?: string;
    source: DashboardDataRef;
    rowKey: string;
    item: {
        title: DashboardBinding;
        subtitle?: DashboardBinding;
        icon?: string;
        badge?: DashboardBinding;
    };
    selection?: { opens?: string };
    reorderable?: { action: string };
    actions?: DashboardAction[];
};

export type DashboardDetailMainItem = DashboardSection | DashboardNavigationListWidget;

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
          main: DashboardDetailMainItem[];
          aside?: DashboardSection[];
      }
    | DashboardNavigationListWidget
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

/**
 * Legacy V1 presentation artifact. Its `views` property contains widgets,
 * despite the historical name. New integrations must use DashboardView.
 */
export type LegacyDashboardDefinition = {
    id: string;
    meta?: DashboardMeta;
    source: string;
    views: DashboardWidget[];
    requires?: string;
};

/** @deprecated Read-only V1 compatibility shape. */
export type DashboardDto = LegacyDashboardDefinition;
/** @deprecated Use DashboardViewDefinition or DashboardDefinition. */
export type Dashboard = LegacyDashboardDefinition;
