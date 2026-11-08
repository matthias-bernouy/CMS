import { defineCapability } from "content/application/capabilities/define";
import { localizationUpdateInputSchema, localizationSettingsSchema } from "content/application/schemas/localization";
import { localizationUpdateErrors as errors } from "content/application/schemas/errors";
import { language, languages, revision } from "content/application/core/capabilities/input";
export const localizationUpdate = defineCapability({
    id: "localization.update",
    description: "Update the default, available and active site languages with revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/localization",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    REVISION_CONFLICT: 409,
                    UPGRADE_IN_PROGRESS: 423,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_localization_update",
                description:
                    "Change the primary, additional and active site languages using the current expectedRevision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: localizationUpdateInputSchema,
    output: localizationSettingsSchema,
    errors,
    execute: async ({ input, services }) => {
        const expectedRevision = revision(input.expectedRevision);
        const system = await services.repo.updateSystem(
            {
                site: {
                    language: language(input.language),
                    additionalLanguages: languages(input.additionalLanguages),
                    activeLanguages: languages(input.activeLanguages),
                },
            } as never,
            expectedRevision,
        );
        return {
            revision: expectedRevision + 1,
            language: system.site.language,
            additionalLanguages: system.site.additionalLanguages,
            activeLanguages: system.site.activeLanguages,
        };
    },
});
