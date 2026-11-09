import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { listCollectionInstallations } from "../list-collection-installations";
import { installCollectionsOutputSchema } from "repository/application/installations/schemas/collections/install-collection";

export const listInstalledCollections = defineCapability({
    ...listCollectionInstallations,
    id: "list-installed-collections",
    output: installCollectionsOutputSchema,
    bindings: listCollectionInstallations.bindings.map((binding) =>
        binding.transport === "http"
            ? { ...binding, path: "/list-installed-collections" }
            : { ...binding, tool: { ...binding.tool, name: "installations_list_installed_collections" } },
    ),
});
