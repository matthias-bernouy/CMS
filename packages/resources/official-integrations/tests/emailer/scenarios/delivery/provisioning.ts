import { expect, test } from "bun:test";
import { welcomeTemplate } from "../../fixtures/templates";
import { createHarness } from "../../harness/create";
import { sourceJson } from "../../harness/requests";
import { okJson } from "../../harness/responses";

export function registerTemplateProvisioningTest(): void {
    test("installs default templates without overwriting an edited template", async () => {
        const harness = await createHarness();
        const defaults = welcomeTemplate();
        await okJson(await sourceJson(harness, "installTemplates", { templates: [defaults] }));
        await okJson(
            await sourceJson(harness, "upsertTemplate", {
                ...defaults,
                subject: "Site-customized subject",
            }),
        );

        await okJson(await sourceJson(harness, "installTemplates", { templates: [defaults] }));

        expect(harness.rest.rows("templates")).toHaveLength(1);
        expect(harness.rest.rows("templates")[0]?.subject).toBe("Site-customized subject");
    });
}
