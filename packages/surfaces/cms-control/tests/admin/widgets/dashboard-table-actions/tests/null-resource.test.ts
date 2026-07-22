import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "cms-control/components/admin/Resources/Dashboards/view/actions";
import { setupDashboardActionTests } from "../setup";
import { type RecordedDetailResource, resourceActionContext } from "../support";

setupDashboardActionTests();

describe("dashboard table actions", () => {
    test("reloads when a mutation resource is null", async () => {
        globalThis.fetch = (async () => Response.json(null)) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const reloaded: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            reload: (collection, row) => reloaded.push({ collection, row }),
        });

        await runDashboardWidgetAction(context, {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect(resources).toEqual([]);
        expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);
    });
});
