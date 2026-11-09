import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { updateCollectionConfiguration } from "../update-collection-configuration";
import { installCollectionsOutputSchema } from "repository/application/installations/schemas/collections/install-collection";
import { configureCollection as configure } from "repository/application/installations/core/collections/configuration";

export const configureCollection = defineCapability({
    ...updateCollectionConfiguration,
    id: "configure-collection",
    output: installCollectionsOutputSchema,
    bindings: updateCollectionConfiguration.bindings.map((binding) =>
        binding.transport === "http"
            ? { ...binding, path: "/configure-collection" }
            : { ...binding, tool: { ...binding.tool, name: "installations_configure_collection" } },
    ),
    execute: ({ services, input, context }) => configure(services, context.siteId, input, 8192),
});
