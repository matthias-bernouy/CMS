import { afterEach, expect, test } from "bun:test";

import { LateralMenu } from "../../src/ui/Navigation/Menu/LateralMenu/LateralMenu";

if (!customElements.get("w13c-lateral-menu")) {
    customElements.define("w13c-lateral-menu", LateralMenu);
}

afterEach(() => document.body.replaceChildren());

test("an embedded menu closes after an outside interaction", () => {
    const menu = document.createElement("w13c-lateral-menu");
    menu.setAttribute("variant", "embedded");
    const outside = document.createElement("button");
    document.body.append(menu, outside);
    const toggle = menu.shadowRoot!.querySelector<HTMLButtonElement>(".embedded-toggle")!;

    toggle.click();
    expect(menu.hasAttribute("open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    expect(menu.hasAttribute("open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
});
