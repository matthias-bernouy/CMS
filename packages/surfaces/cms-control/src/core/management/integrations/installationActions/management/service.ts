import { syncIntegrationRuntimeSecrets } from "../../runtime/runtimeSecrets";
import { publishedPageResolver } from "cms-control/core/management/integrations/runtime/publishedPageResolver";
import { IntegrationManagementService, IntegrationRuntimeError } from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";

const services = new WeakMap<ControlCms, IntegrationManagementService>();
export function integrationManagement(cms: ControlCms): IntegrationManagementService {
    const existing = services.get(cms);
    if (existing) {
        return existing;
    }
    const service = new IntegrationManagementService({
        installations: cms.integrationInstallations,
        resolvePublishedPage: publishedPageResolver(cms.repository, cms.config?.deliveryUrl),
        secrets: cms.secrets,
        async invoke() {
            throw new IntegrationRuntimeError("Legacy integration management functions were removed", 503);
        },
        syncRuntimeSecrets: (installation, values) =>
            syncIntegrationRuntimeSecrets(cms.integrationConnectorDeployers, installation, values),
    });
    services.set(cms, service);
    return service;
}
