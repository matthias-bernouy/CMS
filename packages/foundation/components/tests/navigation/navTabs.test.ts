import { describe, expect, test } from "bun:test";

import { NavTab } from "../../src/ui/Navigation/NavTabs/NavTab/NavTab";
import { NavTabs } from "../../src/ui/Navigation/NavTabs/NavTabs";

if (!customElements.get("p9r-nav-tabs-test")) {
    customElements.define("p9r-nav-tabs-test", NavTabs);
}
if (!customElements.get("p9r-nav-tab-test")) {
    customElements.define("p9r-nav-tab-test", NavTab);
}

describe("navigation tabs", () => {
    test("exposes a labelled navigation landmark", () => {
        const tabs = document.createElement("p9r-nav-tabs-test");
        tabs.setAttribute("aria-label", "Collection sections");
        document.body.append(tabs);

        expect(tabs.shadowRoot!.querySelector("nav")!.getAttribute("aria-label")).toBe("Collection sections");
    });

    test("reflects route, count and current-page state", () => {
        const tab = document.createElement("p9r-nav-tab-test") as NavTab;
        tab.textContent = "Theme";
        tab.setAttribute("aria-label", "Theme");
        tab.href = "/admin/collections/mossa/theme";
        tab.count = "55";
        tab.active = true;
        document.body.append(tab);

        const link = tab.shadowRoot!.querySelector("a")!;
        expect(link.getAttribute("href")).toBe("/admin/collections/mossa/theme");
        expect(link.getAttribute("aria-current")).toBe("page");
        expect(link.getAttribute("aria-label")).toBe("Theme");
        expect(tab.shadowRoot!.querySelector(".count")!.textContent).toBe("55");

        tab.active = false;
        expect(link.hasAttribute("aria-current")).toBeFalse();
    });

    test("provides a CSS-only fitted mobile variant", () => {
        const tabs = document.createElement("p9r-nav-tabs-test");
        const styles = tabs.shadowRoot!.querySelector("style")!.textContent ?? "";

        expect(styles).toContain(":host([fit]) nav");
        expect(styles).toContain("--nav-tab-count-display: none");
        expect(styles).toContain("justify-content: space-between");
    });

    test("reveals the active route when regular tabs overflow", async () => {
        const tabs = document.createElement("p9r-nav-tabs-test");
        const tab = document.createElement("p9r-nav-tab-test") as NavTab;
        const navigation = tabs.shadowRoot!.querySelector<HTMLElement>("nav")!;
        Object.defineProperties(navigation, {
            clientWidth: { value: 200 },
            scrollWidth: { value: 400 },
            scrollLeft: { value: 0, writable: true },
        });
        navigation.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, width: 200 });
        tab.getBoundingClientRect = () => DOMRect.fromRect({ x: 300, width: 80 });
        tabs.append(tab);
        document.body.append(tabs);

        tab.active = true;
        await new Promise((resolve) => requestAnimationFrame(resolve));

        expect(navigation.scrollLeft).toBe(180);
    });
});
