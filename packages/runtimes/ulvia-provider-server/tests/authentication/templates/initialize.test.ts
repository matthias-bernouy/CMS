import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import { MemoryTemplateStore } from "@bernouy/email-templates/memory";
import { MemoryAccountEmailConfigurationStore } from "@bernouy/auth/email-templates";
import { initializeAccountTemplates } from "../../../src/runtime/authentication/templates/initialize";

test("explicit installation resumes publication, never duplicates seeds or overwrites associations/custom drafts", async () => {
    const service = new EmailTemplates(new MemoryTemplateStore());
    const configuration = new MemoryAccountEmailConfigurationStore();
    let boundaries = 0;
    await expect(
        initializeAccountTemplates(configuration, service, "source-a", () => {
            if (++boundaries === 3) {
                throw new Error("lease lost");
            }
        }),
    ).rejects.toThrow("lease lost");
    expect(await configuration.read()).toBeNull();
    await initializeAccountTemplates(configuration, service, "source-a", () => {});
    const before = await configuration.read();
    const template = await service.get({ id: before!.emailVerification.id });
    await service.updateDraft({
        id: template.id,
        name: "My verification",
        description: "Customized",
        draft: { ...template.draft, subject: "Custom" },
        expectedRevision: template.revision,
    });
    await initializeAccountTemplates(configuration, service, "different-source", () => {});
    expect(await configuration.read()).toEqual(before);
    expect((await service.list({ limit: 100, includeArchived: true })).items).toHaveLength(2);
    expect((await service.get({ id: template.id })).draft.subject).toBe("Custom");
});
