import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { Grid } from "../../src/ui/Layout/Grid/Grid";
import { LeftMenuLayout } from "../../src/ui/Layout/LeftMenuLayout/LeftMenuLayout";

if (!customElements.get("p9r-grid-test")) {
    customElements.define("p9r-grid-test", Grid);
}

if (!customElements.get("w13c-left-menu-layout-test")) {
    customElements.define("w13c-left-menu-layout-test", LeftMenuLayout);
}

const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 390;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const setViewportWidth = (width: number): void => {
    (window as typeof window & { happyDOM: { setInnerWidth(value: number): void } }).happyDOM.setInnerWidth(width);
};

describe("Grid", () => {
    test("exposes max item width without replacing the responsive track sizing", () => {
        const grid = document.createElement("p9r-grid-test");
        const styles = grid.shadowRoot!.querySelector("style")!.textContent ?? "";

        expect(styles).toContain("grid-template-columns: repeat(auto-fill, minmax(min(var(--min), 100%), 1fr));");
        expect(styles).toContain("--item-max: none;");
        expect(styles).toContain(':host([max="md"])   { --item-max: 320px; }');
        expect(styles).toContain(':host([max]:not([max="none"])) ::slotted(*)');
        expect(styles).toContain(':host([justify-items="stretch"]) { --item-justify: stretch; }');
    });
});

describe("LeftMenuLayout mobile navigation", () => {
    beforeEach(() => {
        document.body.replaceChildren();
        setViewportWidth(MOBILE_WIDTH);
    });

    afterEach(() => {
        document.body.replaceChildren();
        setViewportWidth(DESKTOP_WIDTH);
    });

    test("keeps the content track available at phone widths", () => {
        const layout = document.createElement("w13c-left-menu-layout-test");
        const styles = layout.shadowRoot!.querySelector("style")!.textContent ?? "";

        expect(styles).toContain("@media (max-width: 720px)");
        expect(styles).toContain('"content" minmax(0, 1fr)');
        expect(styles).toContain(".app-content {\n        grid-area: content;\n        width: 100%;");
        expect(styles).toContain("min-width: 0;");
    });

    test("moves focus to content through the skip link", () => {
        const layout = document.createElement("w13c-left-menu-layout-test");
        document.body.append(layout);

        layout.shadowRoot!.querySelector<HTMLAnchorElement>(".skip-link")!.click();

        expect(layout.shadowRoot!.activeElement).toBe(layout.shadowRoot!.querySelector(".app-content"));
    });

    test("exposes one drawer at a time and keeps closed navigation inert", async () => {
        const layout = document.createElement("w13c-left-menu-layout-test");
        const primaryNavigation = document.createElement("div");
        primaryNavigation.slot = "sidebar";
        const secondaryNavigation = document.createElement("div");
        secondaryNavigation.slot = "secondary-sidebar";
        layout.append(primaryNavigation, secondaryNavigation);
        document.body.append(layout);
        await flush();

        const root = layout.shadowRoot!;
        const primaryToggle = root.querySelector<HTMLButtonElement>('[data-mobile-nav="primary"]')!;
        const secondaryToggle = root.querySelector<HTMLButtonElement>('[data-mobile-nav="secondary"]')!;
        const primarySidebar = root.querySelector<HTMLElement>(".app-sidebar")!;
        const secondarySidebar = root.querySelector<HTMLElement>(".secondary-sidebar")!;
        const backdrop = root.querySelector<HTMLButtonElement>("[data-mobile-nav-close]")!;

        expect(secondaryToggle.hidden).toBe(false);
        expect(primarySidebar.hasAttribute("inert")).toBe(true);
        expect(secondarySidebar.hasAttribute("inert")).toBe(true);

        primaryToggle.click();

        expect(layout.hasAttribute("mobile-primary-open")).toBe(true);
        expect(layout.hasAttribute("mobile-secondary-open")).toBe(false);
        expect(primaryToggle.getAttribute("aria-expanded")).toBe("true");
        expect(primarySidebar.hasAttribute("inert")).toBe(false);
        expect(secondarySidebar.hasAttribute("inert")).toBe(true);
        expect(backdrop.hidden).toBe(false);

        secondaryToggle.click();

        expect(layout.hasAttribute("mobile-primary-open")).toBe(false);
        expect(layout.hasAttribute("mobile-secondary-open")).toBe(true);
        expect(primarySidebar.hasAttribute("inert")).toBe(true);
        expect(secondarySidebar.hasAttribute("inert")).toBe(false);

        backdrop.click();

        expect(layout.hasAttribute("mobile-primary-open")).toBe(false);
        expect(layout.hasAttribute("mobile-secondary-open")).toBe(false);
        expect(secondaryToggle.getAttribute("aria-expanded")).toBe("false");
        expect(backdrop.hidden).toBe(true);
        expect(document.activeElement).toBe(layout);
        expect(root.activeElement).toBe(secondaryToggle);
    });

    test("closes the drawer after a navigation action or Escape", async () => {
        const layout = document.createElement("w13c-left-menu-layout-test");
        const navigation = document.createElement("div");
        navigation.slot = "sidebar";
        const link = document.createElement("a");
        link.href = "/admin/pages";
        link.textContent = "Pages";
        navigation.append(link);
        const contentAction = document.createElement("button");
        contentAction.textContent = "Save";
        layout.append(navigation, contentAction);
        document.body.append(layout);
        await flush();

        const root = layout.shadowRoot!;
        const primaryToggle = root.querySelector<HTMLButtonElement>('[data-mobile-nav="primary"]')!;

        primaryToggle.click();
        link.click();
        expect(layout.hasAttribute("mobile-primary-open")).toBe(false);
        expect(root.activeElement).toBe(root.querySelector(".app-content"));

        contentAction.focus();
        contentAction.click();
        expect(document.activeElement).toBe(contentAction);

        primaryToggle.click();
        primaryToggle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));

        expect(layout.hasAttribute("mobile-primary-open")).toBe(false);
        expect(root.activeElement).toBe(primaryToggle);
    });

    test("restores desktop sidebar accessibility when the viewport grows", async () => {
        const layout = document.createElement("w13c-left-menu-layout-test");
        const primaryNavigation = document.createElement("div");
        primaryNavigation.slot = "sidebar";
        layout.append(primaryNavigation);
        document.body.append(layout);
        await flush();

        const primarySidebar = layout.shadowRoot!.querySelector<HTMLElement>(".app-sidebar")!;
        expect(primarySidebar.getAttribute("aria-hidden")).toBe("true");
        expect(primarySidebar.hasAttribute("inert")).toBe(true);

        setViewportWidth(DESKTOP_WIDTH);
        const mobileMedia = (layout as unknown as { _mobileMedia: MediaQueryList })._mobileMedia;
        mobileMedia.dispatchEvent(new Event("change"));
        await flush();

        expect(layout.hasAttribute("mobile-primary-open")).toBe(false);
        expect(primarySidebar.getAttribute("aria-hidden")).toBe("false");
        expect(primarySidebar.hasAttribute("inert")).toBe(false);
    });

    test("preserves the collapsed accessibility state on desktop", async () => {
        setViewportWidth(DESKTOP_WIDTH);
        const layout = document.createElement("w13c-left-menu-layout-test");
        layout.setAttribute("collapsed", "");
        document.body.append(layout);
        await flush();

        const primarySidebar = layout.shadowRoot!.querySelector<HTMLElement>(".app-sidebar")!;
        expect(primarySidebar.getAttribute("aria-expanded")).toBe("false");
        expect(primarySidebar.getAttribute("aria-hidden")).toBe("true");
        expect(primarySidebar.hasAttribute("inert")).toBe(false);
    });
});
