import { describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import "cms-control/components";
import { widgetsForSelection } from "cms-control/components/admin/Resources/Dashboards/domain";
import { mountDashboardWidgets } from "cms-control/components/admin/Resources/Dashboards/runtime/mounting/mount";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";

describe("dashboard detail main widgets", () => {
    test("mounts a navigation list in the detail main slot with its owning selection", () => {
        const dashboard = detailDashboard();
        const group = sourceGroup(dashboard);
        const detail = { collection: "sectionDetail", row: "section-1" };
        const root = document.createElement("div");

        mountDashboardWidgets(
            root,
            widgetsForSelection(dashboard, detail),
            {
                group,
                dashboard,
                selectedRows: new Map(),
                drafts: new Map(),
                detailResource: { ...detail, sourceId: "forms", dashboardId: "forms", resource: { title: "Intro" } },
            },
            "root",
            new Map(),
            detail,
        );
        const detailElement = root.querySelector<HTMLElement>("cms-dashboard-w-detail")!;
        const wrapper = detailElement.querySelector<HTMLElement>('[slot="main-widget-1"]')!;
        const navigation = wrapper.querySelector("cms-dashboard-w-navigation-list");
        const source = new URL(wrapper.getAttribute("cms-source")!.split(" as ")[0]!, window.location.origin);
        document.body.append(root);
        const widgetSlot = detailElement.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="main-widget-1"]');
        const mainChildren = Array.from(widgetSlot!.parentElement!.children).map((item) =>
            item instanceof HTMLSlotElement ? `${item.tagName}:${item.name}` : item.tagName,
        );

        expect(wrapper.parentElement).toBe(detailElement);
        expect(widgetSlot?.parentElement?.hasAttribute("data-main")).toBeTrue();
        expect(mainChildren).toEqual(["CMS-DETAIL-SECTION", "SLOT:main-widget-1", "CMS-DETAIL-SECTION"]);
        expect(navigation).not.toBeNull();
        expect(source.searchParams.get("context")).toBe("section-1");
        root.remove();
    });

    test("uses nested navigation targets when choosing the dashboard's main widgets", () => {
        const dashboard = detailDashboard();

        expect(widgetsForSelection(dashboard, null).map((widget) => widget.id)).toEqual(["sectionDetail"]);
        expect(
            widgetsForSelection(dashboard, { collection: "sectionDetail", row: "section-1" }).map(
                (widget) => widget.id,
            ),
        ).toEqual(["sectionDetail"]);
        expect(
            widgetsForSelection(dashboard, { collection: "questionDetail", row: "question-1" }).map(
                (widget) => widget.id,
            ),
        ).toEqual(["questionDetail"]);
    });
});

function detailDashboard(): DashboardDto {
    return {
        id: "forms",
        source: "forms",
        views: [
            {
                widget: "w-detail",
                id: "sectionDetail",
                source: { endpoint: "manageSection", params: { ref: "$selection.id" } },
                main: [
                    { id: "content", title: "Content", fields: [] },
                    {
                        widget: "w-navigation-list",
                        id: "questionNavigation",
                        source: {
                            endpoint: "manageQuestions",
                            params: { context: "$selection.sectionDetail.id" },
                            itemsPath: "items",
                        },
                        rowKey: "id",
                        item: { title: { path: "title" } },
                        selection: { opens: "questionDetail" },
                    },
                    { id: "footer", title: "Footer", fields: [] },
                ],
            },
            {
                widget: "w-detail",
                id: "questionDetail",
                source: { endpoint: "manageQuestion", params: { ref: "$selection.id" } },
                main: [],
            },
        ],
    };
}

function sourceGroup(dashboard: DashboardDto): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:forms",
            id: "forms",
            name: "Forms",
            endpointCount: 3,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "manageSection",
                method: "GET",
                targetUrl: "https://example.test/section",
                params: [{ name: "ref", in: "query", type: "string", required: true }],
            },
            {
                endpointId: "manageQuestions",
                method: "GET",
                targetUrl: "https://example.test/questions",
                params: [{ name: "context", in: "query", type: "string", required: true }],
            },
            {
                endpointId: "manageQuestion",
                method: "GET",
                targetUrl: "https://example.test/question",
                params: [{ name: "ref", in: "query", type: "string", required: true }],
            },
        ],
        dashboards: [dashboard],
    };
}
