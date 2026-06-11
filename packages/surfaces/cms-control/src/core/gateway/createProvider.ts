import type { ControlCms } from "cms-control/ControlCms";
import { providerDtoToProvider } from "@bernouy/cms-gateway";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";

/**
 * Creates a gateway provider. The domain rules (urn shape, endpoint membership,
 * duplicate urns, targetUrl, header/param/status policies) are enforced by the
 * `ValidatingGatewayRepository` decorator wired at the composition root. Domain
 * errors carry `.status` so HTTP surfaces do not inspect persistence failures.
 */
export async function createProvider(cms: ControlCms, dto: ProviderDto): Promise<void> {
    await cms.gateway.createProvider(providerDtoToProvider(dto));
}
