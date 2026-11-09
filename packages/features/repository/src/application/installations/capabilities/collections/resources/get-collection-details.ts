import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { getCollectionInstallation } from "../get-collection-installation";
import { getCollectionDetailsOutputSchema } from "repository/application/installations/schemas/collections/get-collection-installation";

export const getCollectionDetails = defineCapability({
    ...getCollectionInstallation,
    id: "get-collection-details",
    output: getCollectionDetailsOutputSchema,
    bindings: getCollectionInstallation.bindings.map((binding) =>
        binding.transport === "http"
            ? { ...binding, path: "/get-collection-details" }
            : { ...binding, tool: { ...binding.tool, name: "installations_get_collection_details" } },
    ),
});
