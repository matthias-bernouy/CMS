import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";
import { toProvider } from "./toProvider";

/**
 * Creates a gateway provider. The domain rules (urn shape, endpoint membership,
 * duplicate urns, targetUrl, header/param/status policies) are enforced by the
 * `ValidatingGatewayRepository` decorator wired at the composition root — its
 * `GatewayValidationError` carries `.status` 400. A duplicate provider urn is
 * mapped to a 400 here — the repo throws a plain Error (InMemory) / E11000
 * (Mongo), neither of which carries a `.status`, so without the mapping it
 * would surface as a 500.
 */
export async function createProvider(cms: ControlCms, dto: ProviderDto): Promise<void> {
    try {
        await cms.gateway.createProvider(toProvider(dto));
    } catch (err) {
        if (isDuplicateKey(err)) throw new InvalidParam("urn", "provider already exists");
        throw err;   // validation (.status 400) or genuine infra error → propagate
    }
}

function isDuplicateKey(err: unknown): boolean {
    if (err instanceof Error && /already exists/i.test(err.message)) return true;        // InMemory repo
    return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;   // Mongo E11000
}
