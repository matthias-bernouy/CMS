import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readInstallationActionBody } from "cms-control/core/management/integrations/installationActions";
import { retryAmbiguousMigrationFromControl } from "cms-control/core/management/integrations/upgrade/migrationRecovery";

export default async function postAmbiguousMigrationReconciliationRetry(request: Request, cms: ControlCms) {
    const integrationId = new URL(request.url).searchParams.get("id")?.trim();
    if (!integrationId) {
        throw new MissingParam("id");
    }
    const result = await retryAmbiguousMigrationFromControl(
        cms,
        request,
        integrationId,
        await readInstallationActionBody(request),
    );
    return Response.json(result);
}
