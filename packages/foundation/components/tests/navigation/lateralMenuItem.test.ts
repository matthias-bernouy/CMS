import { describe, expect, test } from "bun:test";

import { LateralMenuItem } from "../../src/ui/Navigation/Menu/LateralMenu/LateralMenuItem/LateralMenuItem";

if (!customElements.get("w13c-lateral-menu-item")) {
    customElements.define("w13c-lateral-menu-item", LateralMenuItem);
}

describe("LateralMenuItem actions", () => {
    test("forwards an explicit accessible label to its link", () => {
        const item = document.createElement("w13c-lateral-menu-item");
        item.setAttribute("aria-label", "Mossa");
        item.setAttribute("badge", "89");
        document.body.append(item);

        expect(item.shadowRoot!.querySelector("a")!.getAttribute("aria-label")).toBe("Mossa");

        item.setAttribute("aria-label", "Mossa collection");
        expect(item.shadowRoot!.querySelector("a")!.getAttribute("aria-label")).toBe("Mossa collection");
        item.remove();
    });

    test("exposes reusable quick and more action slots", async () => {
        const item = document.createElement("w13c-lateral-menu-item");
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
        const item = document.createElement("w13c-lateral-menu-item");
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

describe("LateralMenuItem controlled active state", () => {
    test("preserves automatic path matching by default", () => {
        const item = document.createElement("w13c-lateral-menu-item");
        item.setAttribute("href", `${location.pathname}?different=query`);
        document.body.append(item);
        expect(item.hasAttribute("active")).toBe(true);
        expect(item.getAttribute("aria-current")).toBe("page");
        item.remove();
    });
    test("manual-active lets a caller select and clear query-specific links without URL reactivation", () => {
        const item = document.createElement("w13c-lateral-menu-item");
        item.setAttribute("manual-active", "");
        item.setAttribute("href", location.pathname);
        document.body.append(item);
        const anchor = item.shadowRoot!.querySelector("a")!;
        expect(item.hasAttribute("active")).toBe(false);
        expect(anchor.classList.contains("active")).toBe(false);
        item.setAttribute("active", "");
        expect(item.getAttribute("aria-current")).toBe("page");
        expect(anchor.classList.contains("active")).toBe(true);
        item.removeAttribute("active");
        window.dispatchEvent(new PopStateEvent("popstate"));
        expect(item.hasAttribute("active")).toBe(false);
        expect(item.hasAttribute("aria-current")).toBe(false);
        expect(anchor.classList.contains("active")).toBe(false);
        item.removeAttribute("manual-active");
        expect(item.hasAttribute("active")).toBe(true);
        item.remove();
    });

    test("hash matching keeps only the current in-page destination active", () => {
        const original = `${location.pathname}${location.search}${location.hash}`;
        history.replaceState(null, "", location.pathname);
        const brand = document.createElement("w13c-lateral-menu-item");
        brand.setAttribute("href", `${location.pathname}#theme-brand`);
        brand.setAttribute("match", "hash");
        const feedback = document.createElement("w13c-lateral-menu-item");
        feedback.setAttribute("href", `${location.pathname}#theme-feedback`);
        feedback.setAttribute("match", "hash");
        document.body.append(brand, feedback);

        expect(brand.hasAttribute("active")).toBe(true);
        expect(brand.getAttribute("aria-current")).toBe("location");
        expect(feedback.hasAttribute("active")).toBe(false);
        history.replaceState(null, "", `${location.pathname}#theme-feedback`);
        window.dispatchEvent(new Event("hashchange"));
        expect(brand.hasAttribute("active")).toBe(false);
        expect(feedback.hasAttribute("active")).toBe(true);

        brand.remove();
        feedback.remove();
        history.replaceState(null, "", original);
    });
});
