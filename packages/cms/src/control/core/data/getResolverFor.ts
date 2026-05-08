import { createHash } from "node:crypto";
import type { ControlCms } from "src/control/ControlCms";
import { SpecParseError } from "src/control/errors/SpecParseError";
import { parseSpec } from "./parseSpec";
import { SpecResolver } from "./SpecResolver";

/**
 * Build (or fetch from cache) a `SpecResolver` for the given provider.
 * Returns `null` when the provider is missing, has never been synced
 * (empty spec), or fails to parse.
 *
 * The cache is keyed by provider id + spec hash so re-parsing only
 * happens when the stored spec actually changes (after `sync`).
 */
export async function getResolverFor(
    cms:        ControlCms,
    providerId: string,
): Promise<SpecResolver | null> {
    const provider = await cms.repository.getDataProvider(providerId);
    if (!provider || !provider.spec) return null;

    const hash = hashSpec(provider.spec);
    let parsed = cms.specCache.get(providerId, hash);
    if (!parsed) {
        try { parsed = parseSpec(provider.spec); }
        catch (e) {
            if (e instanceof SpecParseError) return null;
            throw e;
        }
        cms.specCache.set(providerId, hash, parsed);
    }
    return new SpecResolver(parsed);
}

/** 16-char SHA-256 prefix — collision-resistant enough for the cache key. */
function hashSpec(spec: string): string {
    return createHash("sha256").update(spec).digest("hex").slice(0, 16);
}
