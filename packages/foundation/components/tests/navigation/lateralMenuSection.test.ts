import { afterEach, expect, test } from "bun:test";

import { LateralMenu } from "../../src/ui/Navigation/Menu/LateralMenu/LateralMenu";
import { LateralMenuItem } from "../../src/ui/Navigation/Menu/LateralMenu/LateralMenuItem/LateralMenuItem";
import { LateralMenuSection } from "../../src/ui/Navigation/Menu/LateralMenu/Section/LateralMenuSection";

for (const [tag, constructor] of [
    ["w13c-lateral-menu", LateralMenu],
    ["w13c-lateral-menu-item", LateralMenuItem],
    ["w13c-lateral-menu-section", LateralMenuSection],
] as const) {
    if (!customElements.get(tag)) {
        customElements.define(tag, constructor);
    }
}

afterEach(() => document.body.replaceChildren());

test("a lateral menu section exposes its label, count and collapsed state", () => {
    const section = document.createElement("w13c-lateral-menu-section");
    section.setAttribute("label", "Content");
    section.setAttribute("count", "15");
    document.body.append(section);

    const button = section.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    const content = section.shadowRoot!.querySelector<HTMLElement>(".content")!;
    expect(button.textContent?.replace(/\s+/g, " ").trim()).toBe("Content 15");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(content.hidden).toBe(true);

    button.click();
    expect(section.hasAttribute("open")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(content.hidden).toBe(false);
});

test("lateral menu keyboard navigation includes items in open sections", () => {
    const menu = document.createElement("w13c-lateral-menu");
    const section = document.createElement("w13c-lateral-menu-section");
    const item = document.createElement("w13c-lateral-menu-item");
    section.setAttribute("open", "");
    section.append(item);
    menu.append(section);
    document.body.append(menu);

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(item);
});

test("an embedded menu closes when a nested item is selected", () => {
    const menu = document.createElement("w13c-lateral-menu");
    const section = document.createElement("w13c-lateral-menu-section");
    const item = document.createElement("w13c-lateral-menu-item");
    menu.setAttribute("variant", "embedded");
    menu.setAttribute("open", "");
    section.setAttribute("open", "");
    section.append(item);
    menu.append(section);
    document.body.append(menu);

    item.click();
    expect(menu.hasAttribute("open")).toBe(false);
});
