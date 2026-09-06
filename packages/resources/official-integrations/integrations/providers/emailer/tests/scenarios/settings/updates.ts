import { expect, test } from "bun:test";
import { createHarness } from "../../harness/create";
import { sourceJson } from "../../harness/requests";

export function registerSettingsUpdatesTest(): void {
    test("rejects direct SMTP updates that bypass connection validation and apply", async () => {
        const harness = await createHarness();
        const response = await sourceJson(harness, "updateSettings", { smtpPassword: "raw-secret" });
        expect(response.status).toBe(409);
        expect(JSON.stringify(harness.rest.rows("settings"))).not.toContain("raw-secret");
    });
}
