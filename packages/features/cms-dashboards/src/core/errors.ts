export class DuplicateDashboardError extends Error {
    constructor(readonly dashboardId: string) {
        super(`duplicate dashboard: ${dashboardId}`);
        this.name = "DuplicateDashboardError";
    }
}
