import { describe, expect, test } from "bun:test";
import listAssignments from "cms-control/api/_platform/dashboard-management/assignments.get";
import { mounted } from "./dashboardAccess.fixture";

describe("dashboard operator access", () => {
    test("allows an assigned user through the exact dashboard plan but not direct admin sources", async () => {
        const fixture = await mounted("user", true);
        expect(await fixture.status("GET", "/.cms/dashboards/support/sources/commerce/listOrders")).toBe(200);
        expect(await fixture.status("GET", "/.cms/sources/commerce/listOrders")).toBe(403);
        expect(await fixture.status("GET", "/.cms/dashboards/guessed/sources/commerce/listOrders")).toBe(403);
        expect(await fixture.status("GET", "/.cms/dashboards/support/sources/private/listOrders")).toBe(404);
        expect(await fixture.status("GET", "/.cms/dashboards/support/sources/commerce/privateEndpoint")).toBe(404);
        expect(await fixture.status("GET", "/.cms/dashboards/support//sources/commerce/listOrders")).toBe(403);
        expect(await fixture.status("GET", "/.cms/dashboards/support/sources/commerce/%ZZ")).toBe(403);
        expect(await fixture.status("DELETE", "/.cms/dashboards/support/sources/commerce/listOrders")).toBe(405);
        expect(await fixture.status("POST", "/.cms/dashboards/support/sources/commerce/updateOrders")).toBe(200);
        expect(
            (
                await fixture.request("POST", "/.cms/dashboards/support/sources/commerce/updateOrders", {
                    headers: { Origin: "https://evil.example" },
                })
            ).status,
        ).toBe(403);
    });

    test("denies an unassigned or anonymous user and lets admin bypass assignment", async () => {
        const unassigned = await mounted("support", false);
        expect(await unassigned.status("GET", "/.cms/dashboards/support/sources/commerce/listOrders")).toBe(403);
        expect(await unassigned.status("GET", "/api/dashboard-session")).toBe(403);
        expect(await unassigned.status("GET", "/dashboards")).toBe(403);
        expect(await unassigned.status("GET", "/dashboards/profile")).toBe(403);
        const anonymous = await mounted(null, false);
        expect(await anonymous.status("GET", "/.cms/dashboards/support/sources/commerce/listOrders")).toBe(302);
        expect(await anonymous.status("GET", "/api/dashboard-session")).toBe(401);
        const admin = await mounted("admin", false);
        expect(await admin.status("GET", "/.cms/dashboards/support/sources/commerce/listOrders")).toBe(200);
    });

    test("never delegates a system endpoint even if a stored plan is tampered", async () => {
        const fixture = await mounted("user", true, "system");
        expect(await fixture.status("GET", "/.cms/dashboards/support/sources/commerce/listOrders")).toBe(403);
    });

    test("lists only assigned published dashboards without exposing execution plans", async () => {
        const fixture = await mounted("user", true);
        const response = await fixture.request("GET", "/api/dashboard-session");
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.dashboards.map((dashboard: { id: string }) => dashboard.id)).toEqual(["support"]);
        expect(body.logoutUrl).toBe("/__dev/logout?returnTo=%2Fdashboards");
        expect(JSON.stringify(body)).not.toContain("allowedCalls");
        const detail = await fixture.request("GET", "/api/dashboard-session/dashboard?id=support");
        expect(detail.status).toBe(200);
        const detailBody = await detail.json();
        expect(detailBody.groups[0].endpoints[0]).toMatchObject({ endpointId: "listOrders", targetUrl: "" });
        expect(detailBody.groups[0].endpoints[0]).not.toHaveProperty("headers");
        expect(JSON.stringify(detailBody)).not.toContain("upstream.invalid");
    });

    test("exposes the current profile to authenticated operators without admin access", async () => {
        const fixture = await mounted("user", true);
        expect(await fixture.status("GET", "/dashboards/profile")).toBe(200);
        const response = await fixture.request("GET", "/api/dashboard-session/profile");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            logoutUrl: "/__dev/logout?returnTo=%2Fdashboards",
            email: "operator@example.com",
            role: "user",
            roleLabel: "User",
            provider: "oidc",
            passwordCard: [],
        });

        const unassigned = await mounted("user", false);
        expect(await unassigned.status("GET", "/api/dashboard-session/profile")).toBe(403);
        expect(await unassigned.status("POST", "/api/dashboard-session/profile/password")).toBe(403);
        const anonymous = await mounted(null, false);
        expect(await anonymous.status("GET", "/api/dashboard-session/profile")).toBe(401);
    });

    test("paginates and exactly searches dashboard members on the server", async () => {
        const fixture = await mounted("admin", true, "admin", 105);
        const first = await listAssignments(
            new Request("http://localhost/api/dashboard-management/assignments?id=support&page=1&limit=25"),
            fixture.cms,
        );
        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({ count: 1, page: 1, pageCount: 5, total: 105 });

        const lowest = await listAssignments(
            new Request("http://localhost/api/dashboard-management/assignments?id=support&page=999&limit=1"),
            fixture.cms,
        );
        expect(await lowest.json()).toMatchObject({ page: 105, pageCount: 105, total: 105 });

        const highest = await listAssignments(
            new Request("http://localhost/api/dashboard-management/assignments?id=support&page=1&limit=100"),
            fixture.cms,
        );
        const highestBody = await highest.json();
        expect(highestBody).toMatchObject({ page: 1, pageCount: 2, total: 105, hasMultiplePages: true });
        expect(highestBody.items).toHaveLength(100);

        const searched = await listAssignments(
            new Request(
                "http://localhost/api/dashboard-management/assignments?id=support&search=OPERATOR-50%40EXAMPLE.COM",
            ),
            fixture.cms,
        );
        expect(await searched.json()).toMatchObject({
            page: 1,
            pageCount: 1,
            total: 1,
            items: [{ subjectId: "operator-50", email: "operator-50@example.com", assigned: false }],
        });

        const summary = await listAssignments(
            new Request("http://localhost/api/dashboard-management/assignments?id=support&summary=true"),
            fixture.cms,
        );
        expect(await summary.json()).toEqual({ dashboardId: "support", count: 1, memberLabel: "member" });

        for (const query of ["page=0", "limit=0", "limit=101", "limit=1.5"]) {
            await expect(
                listAssignments(
                    new Request(`http://localhost/api/dashboard-management/assignments?id=support&${query}`),
                    fixture.cms,
                ),
            ).rejects.toThrow(/must be an integer between/);
        }
    });
});
