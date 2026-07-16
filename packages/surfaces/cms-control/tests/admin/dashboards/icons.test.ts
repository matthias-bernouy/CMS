import { describe, expect, test } from "bun:test";
import { renderIcon } from "cms-control/components/admin/Resources/Dashboards/icons";
import {
    DASHBOARD_ICONS,
    type DashboardIconName,
} from "cms-control/components/admin/Resources/Dashboards/icons/catalog";

const SEMANTIC_ICONS = [
    "user",
    "users",
    "shopping-bag",
    "package",
    "tag",
    "receipt",
    "settings",
    "store",
] satisfies DashboardIconName[];

describe("dashboard icons", () => {
    test("renders every semantic dashboard icon instead of the fallback", () => {
        const target = document.createElement("div");

        for (const name of SEMANTIC_ICONS) {
            renderIcon(target, undefined, name, "database");

            const rendered = target.querySelector("svg");
            expect(rendered?.innerHTML).toBe(iconBody(DASHBOARD_ICONS[name]));
            expect(rendered?.getAttribute("aria-hidden")).toBe("true");
        }
    });

    test("keeps the requested fallback for unknown icon names", () => {
        const target = document.createElement("div");

        renderIcon(target, undefined, "unknown", "layout");

        expect(target.querySelector("svg")?.innerHTML).toBe(iconBody(DASHBOARD_ICONS.layout));
    });

    test("renders a hydrated asset SVG first and strips unsafe attributes", () => {
        const target = document.createElement("div");
        const asset = `<svg viewBox="0 0 24 24"><path d="M2 12h20" onclick="alert(1)" fill="url(https://tracker.test)" /></svg>`;

        renderIcon(target, asset, "database", "layout");

        const path = target.querySelector("path");
        expect(path?.getAttribute("d")).toBe("M2 12h20");
        expect(path?.hasAttribute("onclick")).toBeFalse();
        expect(path?.hasAttribute("fill")).toBeFalse();
        expect(target.querySelector("svg")?.innerHTML).not.toBe(iconBody(DASHBOARD_ICONS.database));
    });

    test("falls back when a hydrated asset contains a forbidden element", () => {
        const target = document.createElement("div");

        renderIcon(target, `<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>`, "package", "layout");

        expect(target.querySelector("svg")?.innerHTML).toBe(iconBody(DASHBOARD_ICONS.package));
    });
});

function iconBody(source: string): string {
    const template = document.createElement("template");
    template.innerHTML = source.trim();
    return template.content.firstElementChild?.innerHTML ?? "";
}
