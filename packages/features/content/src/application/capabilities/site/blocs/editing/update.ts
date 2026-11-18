import { defineCapability } from "content/application/capabilities/define";
import { siteBlocUpdateInputSchema, siteBlocSchema } from "content/application/schemas/site";
import { siteBlocsUpdateErrors as errors } from "content/application/schemas/errors";
import { updateCmsSiteBloc } from "content/blocs/core/catalogue/editing/documents";
export const siteBlocsUpdate = defineCapability({
    id: "site-blocs.update",
    description:
        "Save a complete composition draft using its current revision and draftJson from site-blocs.read. Preserve slot IDs. Publishing is a separate operation.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/site-blocs/update",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    STATE_CONFLICT: 409,
                    INVALID_SITE_BLOC: 422,
                    UPGRADE_IN_PROGRESS: 423,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_blocs_update",
                description:
                    "Save a complete composition draft using its current revision and draftJson from site-blocs.read. Preserve slot IDs. Publishing is a separate operation.",
            },
        },
    ],
    docs: ["site/compositions.md", "overview.md"],
    input: siteBlocUpdateInputSchema,
    output: siteBlocSchema,
    errors,
    execute: ({ services, input }) => updateCmsSiteBloc(services.repo, input),
});
