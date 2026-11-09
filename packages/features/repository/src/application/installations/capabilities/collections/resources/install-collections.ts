import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { installCollection } from "../install-collection";
import { installCollectionsOutputSchema } from "repository/application/installations/schemas/collections/install-collection";
import { installCollections as install } from "repository/application/installations/core/collections/mutations";

export const installCollections = defineCapability({
    ...installCollection,
    id: "install-collections",
    output: installCollectionsOutputSchema,
    bindings: installCollection.bindings.map((binding) =>
        binding.transport === "http"
            ? { ...binding, path: "/install-collections" }
            : { ...binding, tool: { ...binding.tool, name: "installations_install_collections" } },
    ),
    execute: ({ services, input, context }) => install(services, context.siteId, input, 8192),
});
