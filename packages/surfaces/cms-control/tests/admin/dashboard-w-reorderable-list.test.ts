import { afterEach, describe, expect, test } from "bun:test";
import "../../src/components/admin/Resources/Dashboards/widgets/w-reorderable-list/WReorderableList";
import type { DashboardWReorderableList } from "../../src/components/admin/Resources/Dashboards/widgets/w-reorderable-list/WReorderableList";

afterEach(() => {
    document.body.replaceChildren();
    delete (Object.prototype as Record<string, unknown>).dashboardPolluted;
});

describe("dashboard reorderable list widget", () => {
    test("reorders items by drag and recomputes their persisted positions", () => {
        const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
        const items = [
            { id: "agency", details: { value: "agency", label: "Agency" }, order: { position: 0 } },
            { id: "club", details: { value: "club", label: "Club" }, order: { position: 1 } },
        ];
        list.data = {
            items,
            itemKey: "id",
            positionPath: "order.position",
            fields: [
                { id: "value", label: "Value", path: "details.value", required: true },
                { id: "label", label: "Label", path: "details.label", required: true },
            ],
        };
        document.body.append(list);

        expect(list.shadowRoot!.querySelector("[data-header]")?.textContent).toBe("ValueLabel");
        expect(list.shadowRoot!.querySelectorAll(".row label")).toHaveLength(0);
        const rows = list.shadowRoot!.querySelectorAll<HTMLElement>(".row");
        rows[0]!.querySelector<HTMLElement>(".handle")!.dispatchEvent(new Event("dragstart", { bubbles: true }));
        rows[1]!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

        expect(list.items).toEqual([
            { id: "club", details: { value: "club", label: "Club" }, order: { position: 0 } },
            { id: "agency", details: { value: "agency", label: "Agency" }, order: { position: 1 } },
        ]);
        expect(items.map(item => item.order.position)).toEqual([0, 1]);
        const snapshot = list.items;
        (snapshot[0]!.details as Record<string, unknown>).label = "Changed";
        expect(list.items[0]?.details).toEqual({ value: "club", label: "Club" });
    });

    test("keeps the edited input mounted while its value changes", () => {
        const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
        const items = [{ id: "agency", details: { label: "Agency" }, position: 0 }];
        list.data = {
            items,
            itemKey: "id",
            fields: [{ id: "label", label: "Label", path: "details.label", required: true }],
        };
        document.body.append(list);

        const input = list.shadowRoot!.querySelector<HTMLInputElement>("[data-item-path='details.label']")!;
        input.focus();
        input.value = "Agency updated";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(list.shadowRoot!.querySelector("[data-item-path='details.label']")).toBe(input);
        expect(list.shadowRoot!.activeElement).toBe(input);
        expect(list.items[0]?.details).toEqual({ label: "Agency updated" });
        expect(items[0]!.details.label).toBe("Agency");
    });

    test("ignores unsafe nested item and position paths", () => {
        const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
        list.data = {
            items: [{}],
            itemKey: "__proto__.dashboardPolluted",
            positionPath: "__proto__.dashboardPolluted",
            fields: [{
                id: "unsafe",
                label: "Unsafe",
                path: "__proto__.dashboardPolluted",
            }],
        };
        document.body.append(list);

        const input = list.shadowRoot!.querySelector<HTMLInputElement>("[data-item-path]")!;
        input.value = "polluted";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(list.items).toEqual([{}]);
        expect(list.shadowRoot!.querySelector<HTMLElement>(".row")?.dataset.itemKey).toBe("0");
        expect((Object.prototype as Record<string, unknown>).dashboardPolluted).toBeUndefined();
    });
});
