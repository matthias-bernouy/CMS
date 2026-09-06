import type { ControlCms } from "cms-control/ControlCms";
import { updateCollectionAvailability } from "@bernouy/cms-integrations";

export async function saveCollectionAvailability(cms: ControlCms, id: string, body: Record<string, unknown>) {
    return updateCollectionAvailability(
        cms.integrationInstallations,
        cms.integrationBlocRepository ?? cms.repository,
        id,
        body,
    );
}
