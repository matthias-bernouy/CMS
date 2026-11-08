import { defineCapability } from "content/application/capabilities/define";
import { emptyInputSchema } from "content/application/schemas/common";
import { editorCatalogueSchema } from "content/application/schemas/pages/outputs";
import { serviceErrors as errors } from "content/application/schemas/errors";
import { getCmsEditorCatalogue } from "content/pages/core/contracts/editorCatalogue";
export const pagesEditorCatalogue = defineCapability({
    id: "pages.editor-catalogue",
    description: "List the author-visible Blocs and bounded insertion metadata available to Pages.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/pages/editor-catalogue",
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
                name: "content_pages_editor_catalogue",
                description:
                    "Read installed Blocs, settings and composition rules before writing Page content. Consult the Page design guide for new layouts.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md", "pages/design.md"],
    input: emptyInputSchema,
    output: editorCatalogueSchema,
    errors,
    execute: ({ services }) => getCmsEditorCatalogue(services.repo),
});
