import type { DashboardDto } from "@bernouy/cms-dashboards";
import { runDashboardWidgetAction } from "cms-control/components/admin/Resources/Dashboards/view/actions";
import { DetailResourceState } from "cms-control/components/admin/Resources/Dashboards/domain";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";
import { withActionResource } from "./dashboard";
import { emailerDashboard, emailerGroup } from "./fixtures/emailer";

export type RecordedDetailResource = {
    collection: string;
    row: string;
    resource: unknown;
};

type ResourceActionContextOptions = {
    dashboard?: DashboardDto;
    group?: DashboardSourceGroup;
    detail: { collection: string; row: string } | null;
    resources: RecordedDetailResource[];
    render?: () => void;
    reload: (collection: string, row: string) => void;
    reloadDefinitions?: () => Promise<void>;
    openDetail?: (collection: string, row: string) => void;
    actionCoordinator?: DetailResourceState;
};

export function resourceActionContext(
    options: ResourceActionContextOptions,
): Parameters<typeof runDashboardWidgetAction>[0] {
    const dashboard =
        options.dashboard ?? withActionResource(emailerDashboard(), "emailerSettings", "saveSettings", "$result");
    return {
        group: options.group ?? emailerGroup(),
        dashboard,
        detail: options.detail,
        drafts: new Map(),
        render: options.render ?? (() => {}),
        ...(options.reloadDefinitions ? { reloadDefinitions: options.reloadDefinitions } : {}),
        reload: options.reload,
        clearDetail() {
            throw new Error("clearDetail should not run");
        },
        openDetail:
            options.openDetail ??
            (() => {
                throw new Error("openDetail should not run");
            }),
        setDetailResource(collection: string, row: string, resource: unknown) {
            options.resources.push({ collection, row, resource });
        },
        actionCoordinator: options.actionCoordinator ?? new DetailResourceState(),
    } as unknown as Parameters<typeof runDashboardWidgetAction>[0];
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
