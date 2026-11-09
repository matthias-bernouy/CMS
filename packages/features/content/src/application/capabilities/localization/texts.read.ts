import { defineCapability } from "content/application/capabilities/define";
import { localizationTextsGet, readTextCatalogue } from "./texts.get";
import { localizationTextsReadOutputSchema } from "content/application/schemas/localization";

export const localizationTextsRead = defineCapability({
    ...localizationTextsGet,
    id: "localization.texts.read",
    output: localizationTextsReadOutputSchema,
    execute: ({ services, input, context }) => readTextCatalogue(services, context.siteId, input),
    bindings: localizationTextsGet.bindings.map((binding) =>
        binding.transport === "http"
            ? { ...binding, path: "/localization/texts/read" }
            : { ...binding, tool: { ...binding.tool, name: "content_localization_texts_read" } },
    ),
});
