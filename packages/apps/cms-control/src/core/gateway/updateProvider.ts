import type { ControlCms } from "cms-control/ControlCms";
import { validateProvider } from "@bernouy/cms-gateway";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";
import { toProvider } from "./toProvider";

/**
 * Updates a gateway provider. The urn (derived from `dto.id`) is the immutable key,
 * so this is a no-rename, full-aggregate replace: the submitted endpoint set wholly
 * replaces the stored one. `validateProvider` runs before the write; an unknown urn
 * (repo returned `null`) is a 400.
 */
export async function updateProvider(cms: ControlCms, dto: ProviderDto): Promise<void> {
    const provider = toProvider(dto);
    const errs = validateProvider(provider);
    if (errs.length) throw new InvalidParam("provider", errs.join("; "));

    const updated = await cms.gateway.updateProvider(provider);
    if (!updated) throw new InvalidParam("urn", "unknown provider");
}
