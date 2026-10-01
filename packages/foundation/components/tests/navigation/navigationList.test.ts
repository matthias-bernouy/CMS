import { expect, test } from "bun:test";
import { NavigationList } from "../../src/ui/Navigation/List/NavigationList";
import { NavigationListItem } from "../../src/ui/Navigation/List/Item/NavigationListItem";

if (!customElements.get("p9r-navigation-list-test")) {
    customElements.define("p9r-navigation-list-test", NavigationList);
}
if (!customElements.get("p9r-navigation-list-item-test")) {
    customElements.define("p9r-navigation-list-item-test", NavigationListItem);
}

test("navigation list item exposes optional content and a link", () => {
    const list = document.createElement("p9r-navigation-list-test");
    const item = document.createElement("p9r-navigation-list-item-test");
    item.setAttribute("href", "/admin/sources");
    for (const [slot, value] of [
        ["title", "Catalog items"],
        ["description", "Browse catalog data"],
        ["badge", "Connected"],
    ] as const) {
        const text = document.createElement("span");
        text.slot = slot;
        text.textContent = value;
        item.append(text);
    }
    list.append(item);
    document.body.append(list);

    const anchor = item.shadowRoot!.querySelector("a")!;
    expect(anchor.getAttribute("href")).toBe("/admin/sources");
    expect(anchor.querySelectorAll("slot")).toHaveLength(5);
    expect(
        anchor.querySelector(".badge")!.compareDocumentPosition(anchor.querySelector(".chevron")!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
});

test("navigation list item without a URL activates by keyboard", () => {
    const item = document.createElement("p9r-navigation-list-item-test");
    document.body.append(item);
    const anchor = item.shadowRoot!.querySelector("a")!;
    let clicks = 0;
    item.addEventListener("click", () => clicks++);
    anchor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(clicks).toBe(1);
    expect(anchor.getAttribute("role")).toBe("button");
    expect(anchor.tabIndex).toBe(0);
    item.setAttribute("disabled", "");
    expect(anchor.tabIndex).toBe(-1);
    anchor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(clicks).toBe(1);
});
