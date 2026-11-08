import { defineCapability } from "content/application/capabilities/define";
import {
    localizationTextsGetInputSchema,
    localizationTextsGetOutputSchema,
} from "content/application/schemas/localization";
import { lookupErrors as errors } from "content/application/schemas/errors";
import { optionalText } from "content/application/core/capabilities/input";
import { readSystemSnapshot } from "content/settings/core/readSystemSnapshot";
export const localizationTextsGet = defineCapability({
    id: "localization.texts.get",
    description: "Read and filter one installed collection's text catalogue for declarative administration.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/localization/texts",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_localization_texts_get",
                description:
                    "Read installed collection texts and their site overrides, optionally filtered by locale, group or search.",
            },
        },
    ],
    docs: ["overview.md"],
    input: localizationTextsGetInputSchema,
    output: localizationTextsGetOutputSchema,
    errors,
    execute: async ({ input, services, context }) => {
        const [snapshot, system] = await Promise.all([
            services.contributions.snapshot(context.siteId),
            readSystemSnapshot(services.repo),
        ]);
        return snapshot.texts(input.collectionId, {
            locale: optionalText(input.locale),
            group: optionalText(input.group),
            search: optionalText(input.search),
            siteLocales: [
                system.system.site.language,
                ...system.system.site.additionalLanguages,
                ...system.system.site.activeLanguages,
            ],
        });
    },
});
