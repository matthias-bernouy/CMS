import { accountTemplateSeeds } from "@bernouy/auth/email-templates";
import type { AccountEmailConfigurationStore } from "@bernouy/auth/email-templates";
import type { EmailTemplates } from "@bernouy/email-templates";

/** Only the explicit instance provisioning/upgrade transition may install default account data. */
export async function initializeAccountTemplates(
    store: AccountEmailConfigurationStore,
    templates: EmailTemplates,
    source: string,
    checkpoint: () => void,
) {
    if (await store.read()) {
        return;
    }
    for (const seed of accountTemplateSeeds) {
        checkpoint();
        let existing;
        try {
            existing = await templates.get({ id: seed.id });
        } catch (error) {
            if (!(error instanceof Error) || error.message !== "NOT_FOUND") {
                throw error;
            }
        }
        if (!existing) {
            existing = await templates.create(
                {
                    id: seed.id,
                    name: seed.name,
                    description: `Installed by ulvia/cms.access: ${seed.purpose}:en`,
                    locale: "en",
                    draft: seed.draft,
                },
                { consumer: "ulvia/cms.access", purpose: seed.purpose },
            );
        }
        if (existing.origin?.consumer !== "ulvia/cms.access" || existing.origin.purpose !== seed.purpose) {
            throw new Error("Default account template identity belongs to a different resource");
        }
        checkpoint();
        if (!existing.latestVersion) {
            await templates.publish({ id: seed.id, expectedRevision: existing.revision });
        }
    }
    checkpoint();
    const verification = accountTemplateSeeds.find((seed) => seed.purpose === "emailVerification")!;
    const reset = accountTemplateSeeds.find((seed) => seed.purpose === "passwordReset")!;
    await store.initialize({
        revision: 1,
        emailVerification: { id: verification.id, version: 1, source },
        passwordReset: { id: reset.id, version: 1, source },
    });
    checkpoint();
}
