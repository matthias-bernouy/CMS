import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { providerDtoToProvider } from "@bernouy/cms-gateway";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";

/**
 * Updates a gateway provider. The urn (derived from `dto.id`) is the immutable key,
 * so this is a no-rename, full-aggregate replace: the submitted endpoint set wholly
 * replaces the stored one. Domain rules are enforced by the `ValidatingGatewayRepository`
 * decorator wired at the composition root; an unknown urn (repo returned `null`) is a 400.
 */
export async function updateProvider(cms: ControlCms, dto: ProviderDto): Promise<void> {
    const updated = await cms.gateway.updateProvider(providerDtoToProvider(dto));
    if (!updated) throw new InvalidParam("urn", "unknown provider");
}
