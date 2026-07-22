import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardActionCompletion, DetailSelection } from "../../domain";
import type { DashboardSourceGroup } from "../../types";

export type DashboardViewActionContext = {
    group: DashboardSourceGroup | null;
    groups?: DashboardSourceGroup[];
    dashboard: DashboardDto | null | undefined;
    detail: DetailSelection | null;
    drafts: Map<string, Record<string, unknown>>;
    render: () => void;
    reloadDefinitions?: () => Promise<void>;
    reload: (collection: string, row: string) => void;
    clearDetail: () => void;
    openDetail: (collection: string, row: string) => void;
    setDetailResource?: (collection: string, row: string, resource: unknown) => void;
    actionCoordinator?: { beginAction: () => () => DashboardActionCompletion };
};
