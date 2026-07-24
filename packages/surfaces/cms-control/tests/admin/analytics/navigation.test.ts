import { afterEach, describe, expect, test } from "bun:test";
import { LateralMenu, LateralMenuItem } from "@bernouy/components";
import "cms-control/components/admin/Layout/Analytics/AnalyticsNav";
import { analyticsViewFromPath, analyticsViewPath } from "cms-control/components/admin/Layout/Analytics/api";

if (!customElements.get("w13c-lateral-menu")) {
    customElements.define("w13c-lateral-menu", LateralMenu);
}
if (!customElements.get("w13c-lateral-menu-item")) {
    customElements.define("w13c-lateral-menu-item", LateralMenuItem);
}

afterEach(() => {
    document.head.innerHTML = "";
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

describe("analytics navigation", () => {
    test("builds base-path aware dashboard routes", () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';

        expect(analyticsViewPath("overview")).toBe("/cms/admin/analytics");
        expect(analyticsViewPath("content")).toBe("/cms/admin/analytics/content");
        expect(analyticsViewPath("endpoints")).toBe("/cms/admin/analytics/endpoints");
        expect(analyticsViewFromPath("/cms/admin/analytics/origins", "/cms")).toBe("origins");
        expect(analyticsViewFromPath("/cms/admin/analytics/endpoints", "/cms")).toBe("endpoints");
        expect(analyticsViewFromPath("/cms/admin/analytics", "/cms")).toBe("overview");
    });

    test("marks the current static dashboard active", () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        history.replaceState(null, "", "/cms/admin/analytics/endpoints");
        const nav = document.createElement("cms-analytics-nav");
        document.body.append(nav);

        const items = Array.from(nav.shadowRoot!.querySelectorAll<HTMLElement>("[data-analytics-view]"));
        const endpoints = items.find((item) => item.dataset.analyticsView === "endpoints")!;
        const overview = items.find((item) => item.dataset.analyticsView === "overview")!;

        expect(endpoints.getAttribute("href")).toBe("/cms/admin/analytics/endpoints");
        expect(endpoints.hasAttribute("active")).toBe(true);
        expect(overview.hasAttribute("active")).toBe(false);
        expect(items.filter((item) => item.hasAttribute("active"))).toEqual([endpoints]);
    });
});
