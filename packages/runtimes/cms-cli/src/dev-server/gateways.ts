import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
    InMemoryGatewayRepository,
    ValidatingGatewayRepository,
    parseUrn,
    seedProviders,
    type GatewayRepository,
    type Provider,
} from "@bernouy/cms-gateway";

/**
 * Load gateway provider manifests from `siteDir/gateways/*.json` — one Provider
 * per file (`urn`, `meta`, `endpoints[]`). Mirrors how blocs are scanned from
 * `siteDir/blocs`: the folder IS the source of truth for dev.
 *
 * Only JSON shape is checked here (parse + skip-on-error); provider validation
 * and urn-uniqueness happen in `seedProviders` so a malformed manifest fails
 * loudly at seed time rather than silently dropping a provider.
 */
export async function loadDevGateways(siteDir: string): Promise<Provider[]> {
    const dir = join(siteDir, "gateways");
    if (!existsSync(dir)) return [];

    let entries: string[];
    try { entries = await readdir(dir); }
    catch { return []; }

    const providers: Provider[] = [];
    for (const entry of entries.sort()) {
        if (!entry.endsWith(".json")) continue;
        try {
            providers.push(JSON.parse(await readFile(join(dir, entry), "utf-8")) as Provider);
        } catch (e) {
            console.warn(`[gateways] skipped ${entry}: ${e instanceof Error ? e.message : e}`);
        }
    }
    return providers;
}

export async function createDevGateway(siteDir: string): Promise<GatewayRepository> {
    const gateway = new ValidatingGatewayRepository(new LocalFsGatewayRepository(siteDir));
    const providers = await loadDevGateways(siteDir);
    if (providers.length > 0) {
        const { created, skipped } = await seedProviders(gateway, providers);
        console.log(`→ Gateways : ${created.length} seeded${skipped.length ? `, ${skipped.length} skipped` : ""} (${providers.map(p => p.urn).join(", ")})`);
    }
    return gateway;
}

/**
 * Local dev gateway store. Keeps the hot process fast with an in-memory index,
 * while persisting every admin mutation to `siteDir/gateways/<provider>.json`.
 */
export class LocalFsGatewayRepository implements GatewayRepository {
    private readonly inner = new InMemoryGatewayRepository();
    private readonly dir: string;

    constructor(siteDir: string) {
        this.dir = join(siteDir, "gateways");
    }

    async createProvider(provider: Provider): Promise<Provider> {
        const created = await this.inner.createProvider(provider);
        try {
            await this.writeProvider(created);
        } catch (error) {
            await this.inner.deleteProvider(provider.urn);
            throw error;
        }
        return created;
    }

    async updateProvider(provider: Provider): Promise<Provider | null> {
        const previous = await this.inner.getProvider(provider.urn);
        const updated = await this.inner.updateProvider(provider);
        if (!updated) return null;
        try {
            await this.writeProvider(updated);
        } catch (error) {
            if (previous) await this.inner.updateProvider(previous);
            throw error;
        }
        return updated;
    }

    async deleteProvider(urn: string): Promise<boolean> {
        const deleted = await this.inner.deleteProvider(urn);
        if (!deleted) return false;
        await unlink(this.fileFor(urn)).catch((error: { code?: string }) => {
            if (error.code !== "ENOENT") throw error;
        });
        return true;
    }

    getProvider(urn: string) {
        return this.inner.getProvider(urn);
    }

    getAllProviders() {
        return this.inner.getAllProviders();
    }

    getEndpoint(urn: string) {
        return this.inner.getEndpoint(urn);
    }

    private async writeProvider(provider: Provider): Promise<void> {
        await mkdir(this.dir, { recursive: true });
        await writeFile(this.fileFor(provider.urn), `${JSON.stringify(provider, null, 4)}\n`, "utf-8");
    }

    private fileFor(urn: string): string {
        const id = parseUrn(urn)?.provider ?? urn.replace(/[^a-zA-Z0-9_-]+/g, "-");
        return join(this.dir, `${id}.json`);
    }
}
