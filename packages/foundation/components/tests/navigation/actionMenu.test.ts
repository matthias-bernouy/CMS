import { afterEach, beforeAll, expect, test } from "bun:test";
import { ActionMenu } from "../../src/ui/Navigation/Menu/ActionMenu/ActionMenu";

beforeAll(() => {
    if (!customElements.get("p9r-action-menu-popover-test")) {
        customElements.define("p9r-action-menu-popover-test", ActionMenu);
    }
});

afterEach(() => {
    document.body.replaceChildren();
});

test("opens its panel as a viewport popover", () => {
    const menu = document.createElement("p9r-action-menu-popover-test") as ActionMenu;
    document.body.append(menu);
    const trigger = menu.shadowRoot?.querySelector<HTMLButtonElement>("[data-trigger]");
    const panel = menu.shadowRoot?.querySelector<HTMLElement>("[data-panel]");

    trigger?.click();

    expect(menu.open).toBe(true);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.getAttribute("popover")).toBe("manual");
    expect(panel?.hidden).toBe(false);
    expect(panel?.style.getPropertyValue("--action-menu-panel-left")).toEndWith("px");
    expect(panel?.style.getPropertyValue("--action-menu-panel-top")).toEndWith("px");
});

test("closes on Escape and restores trigger focus", () => {
    const menu = document.createElement("p9r-action-menu-popover-test") as ActionMenu;
    document.body.append(menu);
    const trigger = menu.shadowRoot?.querySelector<HTMLButtonElement>("[data-trigger]");

    trigger?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(menu.open).toBe(false);
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(menu.shadowRoot?.activeElement).toBe(trigger);
});
