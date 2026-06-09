import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseUrn, type Provider } from "@bernouy/cms-gateway";

export type LocalGateway = {
    /** Provider urn (e.g. "urn:ban") — the primary key on the server. */
    urn:      string;
    /** File stem (e.g. "ban"). */
    slug:     string;
    /** Relative path (e.g. "gateways/ban.json"). */
    file:     string;
    /** The full manifest — fed to `apply`'s flattener. */
    provider: Provider;
    /** Canonical hash for local change-detection against `.p9r-state.json`. */
    hash:     string;
};

const GATEWAYS_SUBDIR = "gateways";

/** Walk `<siteDir>/gateways/*.json` — one Provider manifest per file (same
 *  layout `p9r dev` loads + seeds). */
export async function scanGateways(siteDir: string): Promise<LocalGateway[]> {
    const root = join(siteDir, GATEWAYS_SUBDIR);
    if (!existsSync(root)) return [];

    const files = (await readdir(root)).filter(f => f.endsWith(".json") && !f.startsWith("."));
    const out: LocalGateway[] = [];
    for (const file of files.sort()) {
        const raw = await readFile(join(root, file), "utf-8");
        let provider: Provider;
        try { provider = JSON.parse(raw) as Provider; }
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
export function canonicalGatewayHash(p: Provider): string {
    const comparable = {
        id:   parseUrn(p.urn)?.provider ?? "",
        meta: { name: p.meta?.name ?? "", description: p.meta?.description ?? "", icon: p.meta?.icon ?? "" },
        endpoints: p.endpoints.map(e => ({
            endpointId: parseUrn(e.urn)?.endpoint ?? "",
            method:     e.method,
            targetUrl:  e.targetUrl,
            params:     (e.input?.params ?? []).map(pp => ({
                name: pp.name, in: pp.in, type: pp.schema?.type ?? "string",
                required: !!pp.required, description: pp.description ?? "",
            })),
            body:    e.input?.body ?? null,
            output:  e.output ?? null,
            meta:    e.meta ?? null,
            headers: e.headers ?? null,
        })),
    };
    return createHash("sha256").update(JSON.stringify(comparable)).digest("hex");
}
