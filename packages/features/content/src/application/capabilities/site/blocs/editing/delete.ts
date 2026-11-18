import { defineCapability } from "content/application/capabilities/define";
import { siteBlocDeleteInputSchema, siteBlocDeleteOutputSchema } from "content/application/schemas/site";
import { siteBlocsDeleteErrors as errors } from "content/application/schemas/errors";
import { requireSiteBlocDeletion } from "content/blocs/core/catalogue/editing/references";

export const siteBlocsDelete = defineCapability({
    id: "site-blocs.delete",
    description:
        "Permanently delete one unreferenced site-owned composition using its current revision. Draft and published consumers block deletion; collection resources cannot be deleted.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/site-blocs/delete",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    REFERENCE_CHECK_INCOMPLETE: 503,
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    STATE_CONFLICT: 409,
                    BLOC_REFERENCED: 409,
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
                name: "content_site_blocs_delete",
                description:
                    "Permanently delete one unreferenced site-owned composition using its current revision. Draft and published consumers block deletion; collection resources cannot be deleted.",
            },
        },
    ],
    docs: ["site/compositions.md", "overview.md"],
    input: siteBlocDeleteInputSchema,
    output: siteBlocDeleteOutputSchema,
    errors,
    execute: async ({ services, input }) => {
        requireSiteBlocDeletion(
            await services.repo.getBlocRecord(input.tag),
            input.tag,
            input.revision,
            input.definitionId,
        );
        await services.repo.deleteSiteBloc(input.tag, input.revision, input.definitionId);
        return { tag: input.tag, deleted: true as const };
    },
});
