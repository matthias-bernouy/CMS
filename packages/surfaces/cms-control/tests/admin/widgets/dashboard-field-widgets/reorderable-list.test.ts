import { afterEach, describe, expect, test } from "bun:test";
import "../../../../src/components/admin/Resources/Dashboards/widgets/w-reorderable-list/WReorderableList";
import type { DashboardWReorderableList } from "../../../../src/components/admin/Resources/Dashboards/widgets/w-reorderable-list/WReorderableList";
import {
    W_MEDIA_FIELD_ACTION_EVENT,
    type DashboardMediaActionDetail,
} from "../../../../src/components/admin/Resources/Dashboards/widgets/w-media-field/types";

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
        expect(list.shadowRoot!.querySelectorAll(".row p9r-input")).toHaveLength(4);
        expect(list.shadowRoot!.querySelector("[data-item-path='details.value']")?.getAttribute("required")).toBe("");
        const rows = list.shadowRoot!.querySelectorAll<HTMLElement>(".row");
        rows[0]!.querySelector<HTMLElement>(".handle")!.dispatchEvent(new Event("dragstart", { bubbles: true }));
        rows[1]!.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

        expect(list.items).toEqual([
            { id: "club", details: { value: "club", label: "Club" }, order: { position: 0 } },
            { id: "agency", details: { value: "agency", label: "Agency" }, order: { position: 1 } },
        ]);
        expect(items.map((item) => item.order.position)).toEqual([0, 1]);
        const snapshot = list.items;
        snapshot[0]!.details = { value: "changed", label: "Changed" };
        expect(list.items[0]?.details).toEqual({ value: "club", label: "Club" });
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

        const input = list.shadowRoot!.querySelector<HTMLElement & { value: string }>("[data-item-path='label']")!;
        expect(input.tagName).toBe("P9R-INPUT");
        input.focus();
        input.value = "Agency updated";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(list.shadowRoot!.querySelector("[data-item-path='label']")).toBe(input);
        expect(list.shadowRoot!.activeElement).toBe(input);
        expect(list.items[0]?.label).toBe("Agency updated");
    });

    test("ignores unsafe nested item and position paths", () => {
        const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
        list.data = {
            items: [{}],
            itemKey: "__proto__.dashboardPolluted",
            positionPath: "__proto__.dashboardPolluted",
            fields: [
                {
                    id: "unsafe",
                    label: "Unsafe",
                    path: "__proto__.dashboardPolluted",
                },
            ],
        };
        document.body.append(list);

        const input = list.shadowRoot!.querySelector<HTMLElement & { value: string }>("[data-item-path]")!;
        input.value = "polluted";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(list.items).toEqual([{}]);
        expect(list.shadowRoot!.querySelector<HTMLElement>(".row")?.dataset.itemKey).toBe("0");
        expect((Object.prototype as Record<string, unknown>).dashboardPolluted).toBeUndefined();
    });

    test("renders media choices as cards and scopes nested media actions", () => {
        const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
        list.data = {
            items: [
                {
                    key: "ocean",
                    label: "Ocean",
                    image: { id: "12", url: "/media/ocean.webp", alt: "Ocean dining room" },
                },
            ],
            itemKey: "key",
            layout: "cards",
            fields: [
                { id: "image", label: "Image", path: "image", type: "media" },
                { id: "label", label: "Label", path: "label" },
                { id: "key", label: "Stable key", path: "key", secondary: true },
            ],
        };
        document.body.append(list);

        const root = list.shadowRoot!;
        expect(root.querySelector(".reorderable-list")?.getAttribute("data-layout")).toBe("cards");
        expect(root.querySelector(".card-toolbar code")?.textContent).toBe("ocean");
        expect(root.querySelector(".card-details")?.textContent).toContain("Stable key");
        const media = root.querySelector<HTMLElement>("cms-dashboard-w-media-field")!;
        let detail: DashboardMediaActionDetail | undefined;
        list.addEventListener(W_MEDIA_FIELD_ACTION_EVENT, (event) => {
            detail = (event as CustomEvent<DashboardMediaActionDetail>).detail;
        });
        media.dispatchEvent(
            new CustomEvent(W_MEDIA_FIELD_ACTION_EVENT, {
                bubbles: true,
                composed: true,
                detail: {
                    action: "replace",
                    value: [{ id: "13", url: "/media/new-ocean.webp" }],
                    previousItem: { id: "12", url: "/media/ocean.webp" },
                    file: new File(["image"], "ocean.webp", { type: "image/webp" }),
                },
            }),
        );

        expect(list.items[0]?.image).toEqual({ id: "13", url: "/media/new-ocean.webp" });
        expect(detail).toMatchObject({
            action: "replace",
            itemIndex: 0,
            itemKey: "ocean",
            itemField: "image",
            itemPath: "image",
        });
    });
});
