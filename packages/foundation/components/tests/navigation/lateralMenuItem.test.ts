import { describe, expect, test } from "bun:test";

import { LateralMenuItem } from "../../src/ui/Navigation/Menu/LateralMenu/LateralMenuItem/LateralMenuItem";

if (!customElements.get("w13c-lateral-menu-item-actions-test")) {
    customElements.define("w13c-lateral-menu-item-actions-test", LateralMenuItem);
}

describe("LateralMenuItem actions", () => {
    test("exposes reusable quick and more action slots", async () => {
        const item = document.createElement("w13c-lateral-menu-item-actions-test");
        const quick = document.createElement("button");
        quick.slot = "quick-actions";
        const more = document.createElement("button");
        more.slot = "more-actions";
        item.append("Variables", quick, more);
        document.body.append(item);
        await Promise.resolve();

        expect(item.hasAttribute("has-quick-actions")).toBeTrue();
        expect(item.hasAttribute("has-more-actions")).toBeTrue();
        expect(item.shadowRoot!.querySelector('slot[name="quick-actions"]')).not.toBeNull();
        expect(item.shadowRoot!.querySelector('slot[name="more-actions"]')).not.toBeNull();
        expect(item.shadowRoot!.querySelector('slot[name="quick-actions"]')!.closest("a")).toBeNull();
        expect(item.shadowRoot!.querySelector('slot[name="more-actions"]')!.closest("a")).toBeNull();

        quick.remove();
        await Promise.resolve();
        expect(item.hasAttribute("has-quick-actions")).toBeFalse();
    });

    test("keeps action clicks separate from item navigation", () => {
        const parent = document.createElement("div");
        const item = document.createElement("w13c-lateral-menu-item-actions-test");
        const action = document.createElement("button");
        action.slot = "quick-actions";
        item.append("Variables", action);
        parent.append(item);
        document.body.append(parent);
        let actionClicks = 0;
        let navigationClicks = 0;
        action.addEventListener("click", () => actionClicks++);
        parent.addEventListener("click", () => navigationClicks++);

        action.click();

        expect(actionClicks).toBe(1);
        expect(navigationClicks).toBe(0);
    });
});
