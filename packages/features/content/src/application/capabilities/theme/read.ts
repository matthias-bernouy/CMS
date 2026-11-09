import { defineCapability } from "content/application/capabilities/define";
import { themeGet, readThemeWorkspace } from "./get";
import { themeReadOutputSchema } from "content/application/schemas/theme";

export const themeRead = defineCapability({
    ...themeGet,
    id: "theme.read",
    output: themeReadOutputSchema,
    execute: ({ services, input, context }) => readThemeWorkspace(services, context.siteId, input),
    bindings: themeGet.bindings.map((binding) =>
        binding.transport === "http"
            ? { ...binding, path: "/theme/read" }
            : { ...binding, tool: { ...binding.tool, name: "content_theme_read" } },
    ),
});
