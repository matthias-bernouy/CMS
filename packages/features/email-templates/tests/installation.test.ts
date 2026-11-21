import { expect, test } from "bun:test";
import { templateInstallationId, EmailTemplates } from "@bernouy/email-templates";
import { MemoryTemplateStore } from "@bernouy/email-templates/memory";

test("installation identity separates consumers, purposes and locales without deriving authority from a name", async () => {
    const id = templateInstallationId("ulvia/cms.access", "verification", "en-US");
    expect(id).toBe(templateInstallationId("ulvia/cms.access", "verification", "en-us"));
    expect(
        new Set([
            id,
            templateInstallationId("ulvia/cms.forms", "verification", "en-US"),
            templateInstallationId("ulvia/cms.access", "reset", "en-US"),
            templateInstallationId("ulvia/cms.access", "verification", "fr"),
        ]).size,
    ).toBe(4);
    const service = new EmailTemplates(new MemoryTemplateStore());
    await expect(
        service.create(
            {
                id,
                locale: "en-US",
                name: "Invalid owner",
                description: "",
                draft: { subject: "Hello", text: "World", variables: [] },
            },
            { consumer: "ulvia/cms.forms", purpose: "verification" },
        ),
    ).rejects.toThrow("INVALID_INPUT");
    expect((await service.list({ limit: 100, includeArchived: true })).items).toHaveLength(0);
});
