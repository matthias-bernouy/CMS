import type { ControlCms } from "cms-control/ControlCms";
import { ContentValidationError } from "@bernouy/cms-content";
import { parseIntegrationImportDto } from "@bernouy/cms-integrations";
import { rerunInstallation } from "cms-control/core/management/integrations/installationActions/rerun";

export async function saveCollectionAvailability(cms: ControlCms, id: string, body: Record<string, unknown>) {
    const installation = await cms.integrationInstallations.get(id);
    if (!installation) {
        throw Object.assign(new Error("Collection installation not found"), { status: 404 });
    }
    const definition = installation.definitionSnapshot;
    if (definition?.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        throw new ContentValidationError("id", "availability requires a managed collection");
    }
    const { resources } = parseIntegrationImportDto(
        { kind: id, resources: body.resources === undefined ? [] : body.resources },
        [definition],
    );
    return rerunInstallation(cms, id, { resources });
}
