import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    installCollectionInputSchema,
    installCollectionOutputSchema,
} from "repository/application/installations/schemas/collections/install-collection";
import { installCollectionErrors as errors } from "repository/application/installations/schemas/common/failures";
import { installCollections } from "repository/application/installations/core/collections/mutations";
export const installCollection = defineCapability({
    id: "install-collection",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/install-collection",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    RELEASE_MISMATCH: 409,
                    BROWSER_CAPABILITIES_APPROVAL_REQUIRED: 409,
                    INVALID_STATE: 409,
                    REVISION_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_install_collection",
                description:
                    "Install exact collection releases on this site. Supply their digests, approved browser-risk digests and current installation expectedRevision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: installCollectionInputSchema,
    output: installCollectionOutputSchema,
    errors,
    execute: async ({ services, input, context }) => installCollections(services, context.siteId, input),
});
