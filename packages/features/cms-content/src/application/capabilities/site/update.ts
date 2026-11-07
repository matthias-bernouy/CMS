import { defineCapability } from "cms-content/application/capabilities/define";
import { siteUpdateInputSchema, siteSettingsSchema } from "cms-content/application/schemas/site";
import { localizationUpdateErrors as errors } from "cms-content/application/schemas/errors";
import { ContentCapabilityError } from "cms-content/application/core/capabilities/errors";
import { revision, requiredText } from "cms-content/application/core/capabilities/input";
import { projectSite, sitePageSettings, text, boolean } from "cms-content/application/core/capabilities/site";
export const siteUpdate = defineCapability({
    id: "site.update",
    description: "Update site identity, availability and system Page references with revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/site",
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
                name: "content_site_update",
                description:
                    "Update site name, host, visibility or the 404, forbidden, server-error and login Page references using expectedRevision. References must identify Pages on this instance; null clears a selection.",
            },
        },
    ],
    docs: ["site/system-pages.md", "overview.md"],
    input: siteUpdateInputSchema,
    output: siteSettingsSchema,
    errors,
    execute: async ({ input, services }) => {
        const expectedRevision = revision(input.expectedRevision);
        const pages = await sitePageSettings(services.repo, input);
        if (
            input.name === undefined &&
            input.host === undefined &&
            input.visible === undefined &&
            Object.keys(pages).length === 0
        ) {
            throw new ContentCapabilityError("INVALID_INPUT");
        }
        const system = await services.repo.updateSystem(
            {
                site: {
                    ...(input.name === undefined ? {} : { name: requiredText(input.name) }),
                    ...(input.host === undefined ? {} : { host: text(input.host) }),
                    ...(input.visible === undefined ? {} : { visible: boolean(input.visible) }),
                    ...pages,
                },
            } as never,
            expectedRevision,
        );
        return projectSite(system, expectedRevision + 1);
    },
});
