import { resolveDashboardViews } from "@bernouy/cms-dashboards";
import type { Middleware } from "@bernouy/http-runner";
import type { ControlCms } from "cms-control/ControlCms";
import { changeCurrentPassword, readCurrentProfile } from "cms-control/core/admin/profile";
import { accessibleDashboards, canAccessDashboard } from "./access";
import { dashboardExecutionPlan, operatorSourceGroups } from "./runtime";

export function mountDashboardOperatorRoutes(cms: ControlCms, guard: Middleware): void {
    cms.runner.addEndpoint(
        "GET",
        "/api/dashboard-session",
        async (req) => {
            const subject = await cms.auth.getSubject(req);
            if (!subject) {
                return new Response("Unauthorized", { status: 401 });
            }
            const dashboards = await accessibleDashboards(cms, subject);
            if (!dashboards.length) {
                return new Response("Forbidden", { status: 403 });
            }
            return Response.json({
                subject: {
                    id: subject.identifier,
                    role: subject.role,
                    ...(subject.email ? { email: subject.email } : {}),
                },
                logoutUrl: cms.auth.buildLogoutUrl(`${cms.basePath}/dashboards`),
                dashboards: dashboards.map(({ executionPlan: _plan, ...dashboard }) => dashboard),
            });
        },
        [guard],
    );
    cms.runner.addEndpoint(
        "GET",
        "/api/dashboard-session/dashboard",
        async (req) => {
            const subject = await cms.auth.getSubject(req);
            const id = new URL(req.url).searchParams.get("id") ?? "";
            if (!subject || !(await canAccessDashboard(cms, subject, id))) {
                return new Response("Forbidden", { status: 403 });
            }
            const dashboard = (await cms.dashboards.getDashboard(id))!;
            const resolved = resolveDashboardViews(dashboard, await cms.dashboardViews.getAllViews());
            if (!resolved.dashboard || resolved.errors.length) {
                return Response.json({ errors: resolved.errors }, { status: 409 });
            }
            const plan = await dashboardExecutionPlan(cms, dashboard);
            if (!plan) {
                return Response.json({ errors: ["Dashboard execution plan unavailable"] }, { status: 409 });
            }
            const { executionPlan: _plan, ...safeDashboard } = resolved.dashboard;
            return Response.json({ dashboard: safeDashboard, groups: await operatorSourceGroups(cms, plan) });
        },
        [guard],
    );
    cms.runner.addEndpoint(
        "GET",
        "/api/dashboard-session/profile",
        async (req) => {
            const subject = await cms.auth.getSubject(req);
            if (!subject || !(await accessibleDashboards(cms, subject)).length) {
                return new Response("Forbidden", { status: 403 });
            }
            return Response.json(await readCurrentProfile(req, cms, `${cms.basePath}/dashboards`));
        },
        [guard],
    );
    cms.runner.addEndpoint(
        "POST",
        "/api/dashboard-session/profile/password",
        async (req) => {
            const subject = await cms.auth.getSubject(req);
            if (!subject || !(await accessibleDashboards(cms, subject)).length) {
                return new Response("Forbidden", { status: 403 });
            }
            await changeCurrentPassword(req, cms);
            return Response.json({ ok: true });
        },
        [guard],
    );
}
