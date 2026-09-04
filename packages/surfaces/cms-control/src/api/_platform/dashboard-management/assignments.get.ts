import type { ControlCms } from "cms-control/ControlCms";
import { requiredId } from "cms-control/core/admin/dashboards/input";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export default async function listAssignments(req: Request, cms: ControlCms): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const dashboardId = requiredId(params.get("id"), "id");
    if (!(await cms.dashboards.getDashboard(dashboardId))) {
        return new Response("Dashboard not found", { status: 404 });
    }
    const count = await cms.dashboardAssignments.countForDashboard(dashboardId);
    if (params.get("summary") === "true") {
        return Response.json(summary(dashboardId, count));
    }

    const requestedPage = positiveInteger(params.get("page"), "page", 1);
    const limit = positiveInteger(params.get("limit"), "limit", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const search = params.get("search")?.trim() || undefined;
    let page = await cms.users.list({
        ...(search ? { search } : {}),
        pagination: { page: requestedPage, limit },
    });
    const pageCount = Math.max(1, Math.ceil(page.total / limit));
    if (page.total && requestedPage > pageCount) {
        page = await cms.users.list({
            ...(search ? { search } : {}),
            pagination: { page: pageCount, limit },
        });
    }
    const subjectIds = page.users.map((user) => user.sub);
    const assigned = new Set(await cms.dashboardAssignments.getAssignedSubjectIds(dashboardId, subjectIds));
    return Response.json({
        ...summary(dashboardId, count),
        page: page.page,
        pageCount,
        total: page.total,
        hasMultiplePages: pageCount > 1,
        items: page.users.map((user) => ({
            subjectId: user.sub,
            name: user.email?.trim() || user.sub,
            email: user.email?.trim() || "No email address",
            assigned: assigned.has(user.sub),
            assignedActions: assigned.has(user.sub) ? [{ dashboardId, subjectId: user.sub }] : [],
            availableActions: assigned.has(user.sub) ? [] : [{ dashboardId, subjectId: user.sub }],
        })),
    });
}

function summary(dashboardId: string, count: number) {
    return {
        dashboardId,
        count,
        memberLabel: count === 1 ? "member" : "members",
    };
}

function positiveInteger(value: string | null, name: string, fallback: number, maximum?: number): number {
    if (value === null || value === "") {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
        throw new InvalidParam(name, `must be an integer between 1 and ${maximum ?? Number.MAX_SAFE_INTEGER}.`);
    }
    return parsed;
}
