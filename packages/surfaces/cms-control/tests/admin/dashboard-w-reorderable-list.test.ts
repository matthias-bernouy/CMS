import { afterEach, describe, expect, test } from "bun:test";
import "../../src/components/admin/Resources/Dashboards/widgets/w-reorderable-list/WReorderableList";
import type { DashboardWReorderableList } from "../../src/components/admin/Resources/Dashboards/widgets/w-reorderable-list/WReorderableList";

afterEach(() => document.body.replaceChildren());

describe("dashboard reorderable list widget", () => {
    test("reorders items by drag and recomputes their persisted positions", () => {
        const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
        list.data = {
            items: [
                { id: "agency", value: "agency", label: "Agency", position: 0 },
                { id: "club", value: "club", label: "Club", position: 1 },
            ],
            itemKey: "id",
            positionPath: "position",
            fields: [
                { id: "value", label: "Value", path: "value", required: true },
                { id: "label", label: "Label", path: "label", required: true },
            ],
        };
        document.body.append(list);

        expect(list.shadowRoot!.querySelector("[data-header]")?.textContent).toBe("ValueLabel");
        expect(list.shadowRoot!.querySelectorAll(".row label")).toHaveLength(0);
        const rows = list.shadowRoot!.querySelectorAll<HTMLElement>(".row");
        rows[0]!.querySelector<HTMLElement>(".handle")!.dispatchEvent(new Event("dragstart", { bubbles: true }));
        rows[1]!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

        expect(list.items).toEqual([
            { id: "club", value: "club", label: "Club", position: 0 },
            { id: "agency", value: "agency", label: "Agency", position: 1 },
        ]);
    });

    test("keeps the edited input mounted while its value changes", () => {
        const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
        list.data = {
            items: [{ id: "agency", value: "agency", label: "Agency", position: 0 }],
            itemKey: "id",
            fields: [
                { id: "value", label: "Value", path: "value", required: true },
                { id: "label", label: "Label", path: "label", required: true },
            ],
        };
        document.body.append(list);

        const input = list.shadowRoot!.querySelector<HTMLInputElement>("[data-item-path='label']")!;
        input.focus();
        input.value = "Agency updated";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(list.shadowRoot!.querySelector("[data-item-path='label']")).toBe(input);
        expect(list.shadowRoot!.activeElement).toBe(input);
        expect(list.items[0]?.label).toBe("Agency updated");
    });
});
