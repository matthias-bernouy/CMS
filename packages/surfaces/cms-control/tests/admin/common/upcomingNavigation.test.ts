import { expect, test } from "bun:test";
import { FixedAdminLayout } from "cms-control/components/admin/Layout/AdminLayout/AdminLayout";

test("keeps planned insights visible without exposing unfinished routes", () => {
    const layout = new FixedAdminLayout();
    const items = Array.from(layout.shadowRoot?.querySelectorAll<HTMLElement>("w13c-lateral-menu-item") ?? []);
    const planned = items.filter((item) => ["Analytics", "Audit"].includes(item.textContent?.trim() ?? ""));

    expect(planned.map((item) => item.textContent?.trim())).toEqual(["Analytics", "Audit"]);
    for (const item of planned) {
        expect(item.hasAttribute("disabled")).toBe(true);
        expect(item.getAttribute("badge")).toBe("Upcoming");
        expect(item.hasAttribute("data-route")).toBe(false);
        expect(item.hasAttribute("href")).toBe(false);
    }
});
