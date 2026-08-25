import { afterEach, describe, expect, test } from "bun:test";
import { Button } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-navigation-list/WNavigationList";
import {
    WIDGET_ACTION_EVENT,
    WIDGET_ROW_SELECT_EVENT,
    type WidgetActionDetail,
    type WidgetRowSelectDetail,
} from "../../../src/components/admin/Resources/Dashboards/widgets/shared";

if (!customElements.get("p9r-button")) {
    customElements.define("p9r-button", Button);
}

afterEach(() => document.body.replaceChildren());

describe("dashboard navigation list widget", () => {
    test("renders navigation items with their optional icon, badge, and detail target", async () => {
        const list = navigationList();
        const item = navigationItem("club", "Club", "club", "string");
        list.append(item);
        document.body.append(list);
        await Promise.resolve();

        expect(list.shadowRoot!.querySelector("[data-title]")?.textContent).toBe("Personal information fields");
        expect(item.shadowRoot!.querySelector("[data-icon] svg")).not.toBeNull();
        expect(item.shadowRoot!.querySelector("[data-badge]")?.textContent).toBe("string");
        expect(item.shadowRoot!.querySelector("[data-chevron]")?.hasAttribute("hidden")).toBe(false);

        const selections: WidgetRowSelectDetail[] = [];
        item.addEventListener(WIDGET_ROW_SELECT_EVENT, (event) =>
            selections.push((event as CustomEvent<WidgetRowSelectDetail>).detail),
        );
        item.shadowRoot!.querySelector<HTMLElement>(".item")!.click();
        expect(selections).toEqual([{ collection: "extraFieldDetail", rowKey: "club" }]);
    });

    test("keeps a badge compact when the optional icon is absent", async () => {
        const list = navigationList();
        const item = navigationItem("notifications", "Notifications", "notifications", "boolean", false);
        list.append(item);
        document.body.append(list);
        await Promise.resolve();

        const root = item.shadowRoot!;
        expect(root.querySelector<HTMLElement>("[data-icon]")!.hidden).toBe(true);
        expect(getComputedStyle(root.querySelector<HTMLElement>(".item")!).display).toBe("flex");
        expect(getComputedStyle(root.querySelector<HTMLElement>(".content")!).flexGrow).toBe("1");
        expect(getComputedStyle(root.querySelector<HTMLElement>("[data-badge]")!).flexGrow).toBe("0");
    });

    test("only exposes navigation semantics when an item has a target", async () => {
        const passive = navigationItem("status", "Status", "status", "string");
        passive.removeAttribute("collection");
        document.body.append(passive);
        await Promise.resolve();
        const passiveItem = passive.shadowRoot!.querySelector<HTMLElement>(".item")!;
        expect({ role: passiveItem.getAttribute("role"), tabindex: passiveItem.getAttribute("tabindex") }).toEqual({
            role: null,
            tabindex: null,
        });

        passive.setAttribute("collection", "statusDetail");
        const actionableItem = passive.shadowRoot!.querySelector<HTMLElement>(".item")!;
        expect({
            role: actionableItem.getAttribute("role"),
            tabindex: actionableItem.getAttribute("tabindex"),
        }).toEqual({ role: "button", tabindex: "0" });
    });

    test("emits the configured action with the reordered item ids", async () => {
        const list = navigationList();
        const agency = navigationItem("agency", "Agency", "agency", "string");
        const club = navigationItem("club", "Club", "club", "string");
        list.append(agency, club);
        const actions: WidgetActionDetail[] = [];
        list.addEventListener(WIDGET_ACTION_EVENT, (event) =>
            actions.push((event as CustomEvent<WidgetActionDetail>).detail),
        );
        document.body.append(list);
        await Promise.resolve();

        const action = list.shadowRoot!.querySelector("p9r-button") as HTMLElement;
        expect(action.getAttribute("color")).toBe("primary");
        expect(action.hasAttribute("tone")).toBeFalse();

        agency
            .shadowRoot!.querySelector<HTMLElement>("[data-handle]")!
            .dispatchEvent(new Event("dragstart", { bubbles: true, composed: true }));
        club.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

        expect(
            Array.from(list.querySelectorAll("cms-dashboard-w-navigation-item")).map((item) =>
                item.getAttribute("row-key"),
            ),
        ).toEqual(["club", "agency"]);
        expect(actions).toEqual([{ action: "reorderExtraFields", widget: "extraFields", value: ["club", "agency"] }]);
    });
});

function navigationList(): HTMLElement {
    const list = document.createElement("cms-dashboard-w-navigation-list");
    list.setAttribute(
        "data-config-json",
        JSON.stringify({
            widget: "w-navigation-list",
            id: "extraFields",
            title: "Personal information fields",
            source: { endpoint: "listExtraFields", itemsPath: "fields" },
            rowKey: "id",
            item: { icon: "tag", title: { path: "label" }, subtitle: { path: "id" }, badge: { path: "type" } },
            selection: { opens: "extraFieldDetail" },
            reorderable: { action: "reorderExtraFields" },
            actions: [
                { id: "newExtraField", label: "Add field", selection: { opens: "extraFieldDetail" } },
                { id: "reorderExtraFields", label: "Reorder fields", endpoint: { endpoint: "reorderExtraFields" } },
            ],
        }),
    );
    return list;
}

function navigationItem(id: string, label: string, subtitle: string, badge: string, withIcon = true): HTMLElement {
    const item = document.createElement("cms-dashboard-w-navigation-item");
    item.setAttribute("row-key", id);
    item.setAttribute("title", label);
    item.setAttribute("subtitle", subtitle);
    item.setAttribute("badge", badge);
    if (withIcon) {
        item.setAttribute("icon", "tag");
    }
    item.setAttribute("collection", "extraFieldDetail");
    item.toggleAttribute("reorderable", true);
    return item;
}
