export class DuplicateDashboardError extends Error {
    constructor(readonly dashboardId: string) {
        super(`duplicate dashboard: ${dashboardId}`);
        this.name = "DuplicateDashboardError";
    }
}

export class DuplicateDashboardViewError extends Error {
    constructor(readonly viewId: string) {
        super(`duplicate dashboard view: ${viewId}`);
        this.name = "DuplicateDashboardViewError";
    }
}
