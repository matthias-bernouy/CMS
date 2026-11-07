import { defineCapability } from "cms-content/application/capabilities/define";
import { emptyInputSchema } from "cms-content/application/schemas/common";
import { localizationSettingsSchema } from "cms-content/application/schemas/localization";
import { serviceErrors as errors } from "cms-content/application/schemas/errors";

import { readSystemSnapshot } from "cms-content/settings/core/readSystemSnapshot";
export const localizationGet = defineCapability({
    id: "localization.get",
    description: "Return the default, available and active site languages.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/localization",
            input: {},
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_localization_get",
                description: "Read the site’s language configuration and current revision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: localizationSettingsSchema,
    errors,
    execute: async ({ services, context }) => {
        const [snapshot, contributions] = await Promise.all([
            readSystemSnapshot(services.repo),
            services.contributions.snapshot(context.siteId),
        ]);
        const selectedLanguage = snapshot.system.site.language.trim() || contributions.fallbackLocale || "en";
        return {
            revision: snapshot.revision,
            language: selectedLanguage,
            additionalLanguages: snapshot.system.site.additionalLanguages,
            activeLanguages: snapshot.system.site.activeLanguages,
        };
    },
});
