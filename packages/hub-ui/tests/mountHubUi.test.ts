import { describe, test, expect } from "bun:test";
import type { Authentication, Subject } from "@bernouy/core";
import { BunRunner } from "@bernouy/runner-bun";
import { serveForTest } from "@bernouy/runner-bun/testing";
import { mountHubUi } from "src/exports/mountHubUi";

/** Minimal `Authentication` stub that lets a fixed subject through. */
function stubAuth(role: string): Authentication<string> {
    return {
        loginUrl:        "/login",
        logoutUrl:       "/logout",
        profileUrl:      "/profile",
        buildLoginUrl:   (r: string) => `/login?returnTo=${encodeURIComponent(r)}`,
        buildLogoutUrl:  (r: string) => `/logout?returnTo=${encodeURIComponent(r)}`,
        async getSubject(): Promise<Subject<string> | null> {
            return { identifier: "user-1", role };
        },
    } as unknown as Authentication<string>;
}

describe("mountHubUi", () => {
    test("serves /admin/ index.html through the chrome template (authorized superadmin)", async () => {
        const runner = new BunRunner();
        await mountHubUi({ runner, auth: stubAuth("superadmin") });
        const srv = serveForTest(runner);
        try {
            const res = await srv.request("GET", "/admin/");
            expect(res.status).toBe(200);
            expect(res.headers.get("Content-Type")).toContain("text/html");
            const body = await res.text();
            expect(body).toContain("<!DOCTYPE html>");
            expect(body).toContain("Hub Admin");
            expect(body).toContain("/admin/assets/style.css");
            expect(body).toContain("/admin/assets/ui.js");
        } finally { srv.stop(); }
    });

    test("refuses access when role is not superadmin", async () => {
        const runner = new BunRunner();
        await mountHubUi({ runner, auth: stubAuth("user") });
        const srv = serveForTest(runner);
        try {
            const res = await srv.request("GET", "/admin/");
            expect([401, 403]).toContain(res.status);
        } finally { srv.stop(); }
    });
});
