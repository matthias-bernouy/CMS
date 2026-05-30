import type { ControlCms } from "cms-control/ControlCms";
import { validateProvider } from "@bernouy/cms-gateway";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";
import { toProvider } from "./toProvider";

/**
 * Creates a gateway provider. `validateProvider` runs before the write (urn shape,
 * endpoint membership, duplicate endpoint urns, targetUrl parseability). A duplicate
 * provider urn is mapped to a 400 — the repo throws a plain Error (InMemory) /
 * E11000 (Mongo), neither of which carries a `.status`, so without the mapping it
 * would surface as a 500.
 */
export async function createProvider(cms: ControlCms, dto: ProviderDto): Promise<void> {
    const provider = toProvider(dto);
    const errs = validateProvider(provider);
    if (errs.length) throw new InvalidParam("provider", errs.join("; "));

    try {
        await cms.gateway.createProvider(provider);
    } catch (err) {
        if (isDuplicateKey(err)) throw new InvalidParam("urn", "provider already exists");
        throw err;   // genuine infra error → propagate (500), don't mislabel it
    }
}

function isDuplicateKey(err: unknown): boolean {
    if (err instanceof Error && /already exists/i.test(err.message)) return true;        // InMemory repo
    return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;   // Mongo E11000
}
