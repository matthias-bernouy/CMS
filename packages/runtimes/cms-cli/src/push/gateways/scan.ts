import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceToCanonicalDto, type Source } from "@bernouy/cms-sources";

export type LocalGateway = {
    /** Source urn (e.g. "urn:ban") — the primary key on the server. */
    urn:      string;
    /** File stem (e.g. "ban"). */
    slug:     string;
    /** Relative path (e.g. "gateways/ban.json"). */
    file:     string;
    /** The full manifest — fed to `apply`'s flattener. */
    provider: Source;
    /** Canonical hash for local change-detection against `.p9r-state.json`. */
    hash:     string;
};

const GATEWAYS_SUBDIR = "gateways";

/** Walk `<siteDir>/gateways/*.json` — one Source manifest per file (same
 *  layout `p9r dev` loads + seeds). */
export async function scanGateways(siteDir: string): Promise<LocalGateway[]> {
    const root = join(siteDir, GATEWAYS_SUBDIR);
    if (!existsSync(root)) return [];

    const files = (await readdir(root)).filter(f => f.endsWith(".json") && !f.startsWith("."));
    const out: LocalGateway[] = [];
    for (const file of files.sort()) {
        const raw = await readFile(join(root, file), "utf-8");
        let provider: Source;
        try { provider = JSON.parse(raw) as Source; }
        catch (e) { throw new Error(`Invalid JSON in ${GATEWAYS_SUBDIR}/${file}: ${e instanceof Error ? e.message : e}`); }
        if (!provider || typeof provider.urn !== "string" || !provider.urn) {
            throw new Error(`${GATEWAYS_SUBDIR}/${file}: missing "urn".`);
        }
        out.push({
            urn:      provider.urn,
            slug:     file.slice(0, -".json".length),
            file:     `${GATEWAYS_SUBDIR}/${file}`,
            provider,
            hash:     canonicalGatewayHash(provider),
        });
    }
    return out;
}

/** Stable, key-order-fixed projection hashed for change-detection. Only ever
 *  compared against the same builder's output stored in state, so it just has
 *  to be deterministic — not byte-identical to any server projection. */
export function canonicalGatewayHash(p: Source): string {
    return createHash("sha256").update(JSON.stringify(sourceToCanonicalDto(p))).digest("hex");
}
