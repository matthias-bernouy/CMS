export function auditDashboardMutation(
    actor: string,
    action: "assign" | "create" | "delete" | "publish" | "unassign" | "update",
    dashboardId: string,
    details: Record<string, unknown> = {},
): void {
    console.info(
        JSON.stringify({
            scope: "dashboard-management",
            actor,
            action,
            dashboardId,
            ...details,
        }),
    );
}
