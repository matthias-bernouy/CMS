import { afterEach, describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "../../../../src/components/admin/Resources/Dashboards/view/DashboardViewActions";
import { emailerDashboard, emailerGroup } from "./detailFixtures";
import { tableActionDashboard, tableActionGroup } from "./tableFixtures";
import { resetDashboardActionTest } from "./testSetup";

afterEach(resetDashboardActionTest);

describe("dashboard table actions", () => {
    test("keeps table widget actions routed as table actions", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        let renderCount = 0;

        await runDashboardWidgetAction(
            {
                group: tableActionGroup(),
                dashboard: tableActionDashboard(),
                detail: null,
                drafts: new Map(),
                render() {
                    renderCount++;
                },
                reload() {
                    throw new Error("reload should not run");
                },
                clearDetail() {
                    throw new Error("clearDetail should not run");
                },
                openDetail() {
                    throw new Error("openDetail should not run");
                },
            },
            {
                action: "clearQueue",
                widget: "queueTable",
            },
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/newsletter/clearQueue");
        expect(renderCount).toBe(1);
    });

    test("runs detail widget actions rendered without a selected row", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return new Response(JSON.stringify({ smtpHost: "smtp.saved.test" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        let renderCount = 0;

        await runDashboardWidgetAction(
            {
                group: emailerGroup(),
                dashboard: emailerDashboard(),
                detail: null,
                drafts: new Map(),
                render() {
                    renderCount++;
                },
                reload() {
                    throw new Error("reload should not run");
                },
                clearDetail() {
                    throw new Error("clearDetail should not run");
                },
                openDetail() {
                    throw new Error("openDetail should not run");
                },
            },
            {
                action: "saveSettings",
                detail: true,
                widget: "emailerSettings",
                row: "",
                resource: { provider: "supabase", smtpHost: "smtp.old.test" },
                fields: { smtpHost: "smtp.saved.test" },
            },
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/emailer/updateSettings");
        expect(await requests[0]!.json()).toEqual({ smtpHost: "smtp.saved.test" });
        expect(renderCount).toBe(1);
    });

    test("reloads a selected detail when no post-action resource contract is declared", async () => {
        globalThis.fetch = (async () =>
            Response.json({
                provider: "supabase",
                smtpHost: "smtp.saved.test",
            })) as unknown as typeof fetch;
        const reloaded: Array<{ collection: string; row: string }> = [];

        await runDashboardWidgetAction(
            {
                group: emailerGroup(),
                dashboard: emailerDashboard(),
                detail: { collection: "emailerSettings", row: "default" },
                drafts: new Map(),
                render() {
                    throw new Error("render should not run");
                },
                reload(collection, row) {
                    reloaded.push({ collection, row });
                },
                clearDetail() {
                    throw new Error("clearDetail should not run");
                },
                openDetail() {
                    throw new Error("openDetail should not run");
                },
            },
            {
                action: "saveSettings",
                resource: { provider: "supabase", smtpHost: "smtp.old.test" },
                fields: { smtpHost: "smtp.saved.test" },
            },
        );

        expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);
    });
});
