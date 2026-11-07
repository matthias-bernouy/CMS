import { defineCapability } from "cms-content/application/capabilities/define";
import {
    localizationTextSaveInputSchema,
    localizationTextSaveOutputSchema,
} from "cms-content/application/schemas/localization";
import { localizationTextSaveErrors as errors } from "cms-content/application/schemas/errors";
import { language, requiredText, revision } from "cms-content/application/core/capabilities/input";
export const localizationTextSave = defineCapability({
    id: "localization.text.save",
    description: "Set or clear one locale override for one installed collection text.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/localization/text",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
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
                name: "content_localization_text_save",
                description:
                    "Override one installed collection text on this site for one locale. This does not modify the collection release.",
            },
        },
    ],
    docs: ["overview.md"],
    input: localizationTextSaveInputSchema,
    output: localizationTextSaveOutputSchema,
    errors,
    execute: ({ services, input, context }) =>
        services.contributions.saveText(context.siteId, {
            collectionId: requiredText(input.collectionId),
            expectedRevision: revision(input.expectedRevision),
            locale: language(input.locale),
            textId: requiredText(input.textId),
            value: input.value,
        }),
});
