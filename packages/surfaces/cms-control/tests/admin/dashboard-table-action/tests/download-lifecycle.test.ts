import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "../../../../src/components/admin/Resources/Dashboards/DashboardViewActions";
import { DetailResourceState } from "../../../../src/components/admin/Resources/Dashboards/domain";
import { emailerDashboardWithDownload, emailerGroupWithDownload } from "../fixtures/emailer";
import { setupDashboardActionTests } from "../setup";
import { type RecordedDetailResource, resourceActionContext } from "../support";

setupDashboardActionTests();

describe("dashboard table actions", () => {
    test("reloads once when a download finishes an overlapping mutation batch", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const reloaded: Array<{ collection: string; row: string }> = [];
        const actionCoordinator = new DetailResourceState();
        const context = resourceActionContext({
            dashboard: emailerDashboardWithDownload(),
            group: emailerGroupWithDownload(),
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            actionCoordinator,
            reload: (collection, row) => reloaded.push({ collection, row }),
        });
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        const originalAnchorClick = HTMLAnchorElement.prototype.click;
        URL.createObjectURL = () => "blob:settings";
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = () => {};

        try {
            const mutation = runDashboardWidgetAction(context, {
                action: "saveSettings",
                resource: { provider: "supabase", smtpHost: "smtp.old.test" },
                fields: { smtpHost: "smtp.saved.test" },
            });
            const download = runDashboardWidgetAction(context, {
                action: "exportSettings",
                resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            });
            expect(responses).toHaveLength(2);

            responses[0]!(Response.json({ provider: "supabase", smtpHost: "smtp.saved.test" }));
            await mutation;
            expect(resources).toEqual([]);
            expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);

            responses[1]!(new Response("smtpHost\nsmtp.saved.test\n", { headers: { "content-type": "text/csv" } }));
            await download;

            expect(resources).toEqual([]);
            expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);
        } finally {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
            URL.createObjectURL = originalCreateObjectUrl;
            URL.revokeObjectURL = originalRevokeObjectUrl;
            HTMLAnchorElement.prototype.click = originalAnchorClick;
        }
    });
});
