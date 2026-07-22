import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    actionDefinitionGroups,
    dashboardViewInternals,
    groupsWithFirstDashboard,
    selectedDashboard,
    type DashboardViewInternals,
} from "./fixtures";

const realFetch = globalThis.fetch;

describe("dashboard deep links", () => {
    beforeEach(() => {
        document.body.replaceChildren();
        window.history.replaceState(null, "", `/admin/sources?source=commerce&dashboard=${selectedDashboard}`);
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    test("keeps pending actions current across action-owned view fallbacks", () => {
        for (const fallback of [
            (view: DashboardViewInternals) => view.reloadDetail("productDetail", "product-1"),
            (view: DashboardViewInternals) => view.openDetail("productDetail", "product-1"),
            (view: DashboardViewInternals) => view.clearDetail(),
        ]) {
            const component = dashboardViewInternals();
            const finishFirst = component.detailResource.beginAction();
            const finishSecond = component.detailResource.beginAction();

            expect(finishFirst()).toBe("reload");
            fallback(component);

            expect(finishSecond()).toBe("reload");
        }
    });

    test("keeps the newest dashboard definitions when reloads resolve out of order", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
        const component = dashboardViewInternals();

        const first = component.reloadDefinitions();
        const second = component.reloadDefinitions();
        responses[1]!(Response.json(groupsWithFirstDashboard("new-dashboard")));
        await second;
        responses[0]!(Response.json(groupsWithFirstDashboard("stale-dashboard")));
        await first;

        expect(component.groups[0]?.dashboards[0]?.id).toBe("new-dashboard");
    });

    test("does not reopen a detail removed from refreshed definitions", () => {
        const component = dashboardViewInternals();
        component.groups = groupsWithFirstDashboard(selectedDashboard).map((group) => ({
            ...group,
            dashboards: group.dashboards.map((dashboard) => ({ ...dashboard, views: [] })),
        }));

        component.openDetail("removedDetail", "removed-1");

        expect(component.detailSelection).toBeNull();
    });

    test("removes a detail deep link when refreshed definitions drop its widget", async () => {
        const component = dashboardViewInternals();
        component.detailSelection = { collection: "removedDetail", row: "removed-1" };
        window.history.replaceState(
            null,
            "",
            `/admin/sources?source=commerce&dashboard=${selectedDashboard}&collection=removedDetail&row=removed-1`,
        );
        globalThis.fetch = (async () =>
            Response.json(
                groupsWithFirstDashboard(selectedDashboard).map((group) => ({
                    ...group,
                    dashboards: group.dashboards.map((dashboard) => ({ ...dashboard, views: [] })),
                })),
            )) as unknown as typeof fetch;

        await component.reloadDefinitions();

        expect(component.detailSelection).toBeNull();
        expect(new URL(window.location.href).searchParams.has("collection")).toBeFalse();
        expect(new URL(window.location.href).searchParams.has("row")).toBeFalse();
    });

    test("keeps an invalidating action current when definitions replace its form", async () => {
        const component = dashboardViewInternals();
        component.groups = actionDefinitionGroups(true);
        component.detailSelection = { collection: "createForm", row: "__new__" };
        const finish = component.detailResource.beginAction();
        globalThis.fetch = (async () => Response.json(actionDefinitionGroups(false))) as unknown as typeof fetch;

        await component.reloadDefinitions();

        expect(component.detailSelection).toBeNull();
        expect(finish()).toBe("reuse");
        component.openDetail("createdDetail", "created-1");
        expect(component.detailSelection).toEqual({ collection: "createdDetail", row: "created-1" });
    });
});
