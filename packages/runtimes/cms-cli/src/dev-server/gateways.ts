import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
    InMemorySourceRepository,
    CompositeSourceRepository,
    SYSTEM_SOURCES,
    ValidatingSourceRepository,
    parseUrn,
    seedSources,
    type SourceRepository,
    type Source,
} from "@bernouy/cms-sources";

/**
 * Load gateway provider manifests from `siteDir/gateways/*.json` — one Source
 * per file (`urn`, `meta`, `endpoints[]`). Mirrors how blocs are scanned from
 * `siteDir/blocs`: the folder IS the source of truth for dev.
 *
 * Only JSON shape is checked here (parse + skip-on-error); provider validation
 * and urn-uniqueness happen in `seedSources` so a malformed manifest fails
 * loudly at seed time rather than silently dropping a provider.
 */
export async function loadDevGateways(siteDir: string): Promise<Source[]> {
    const dir = join(siteDir, "gateways");
    if (!existsSync(dir)) return [];

    let entries: string[];
    try { entries = await readdir(dir); }
    catch { return []; }

    const providers: Source[] = [];
    for (const entry of entries.sort()) {
        if (!entry.endsWith(".json")) continue;
        try {
            providers.push(JSON.parse(await readFile(join(dir, entry), "utf-8")) as Source);
        } catch (e) {
            console.warn(`[gateways] skipped ${entry}: ${e instanceof Error ? e.message : e}`);
        }
    }
    return providers;
}

export async function createDevGateway(siteDir: string): Promise<SourceRepository> {
    const gateway = new CompositeSourceRepository(
        new ValidatingSourceRepository(new LocalFsSourceRepository(siteDir)),
        SYSTEM_SOURCES,
    );
    const providers = await loadDevGateways(siteDir);
    if (providers.length > 0) {
        const { created, skipped } = await seedSources(gateway, providers);
        console.log(`→ Gateways : ${created.length} seeded${skipped.length ? `, ${skipped.length} skipped` : ""} (${providers.map(p => p.urn).join(", ")})`);
    }
    return gateway;
}

/**
 * Local dev gateway store. Keeps the hot process fast with an in-memory index,
 * while persisting every admin mutation to `siteDir/gateways/<provider>.json`.
 */
export class LocalFsSourceRepository implements SourceRepository {
    private readonly inner = new InMemorySourceRepository();
    private readonly dir: string;

    constructor(siteDir: string) {
        this.dir = join(siteDir, "gateways");
    }

    async createSource(provider: Source): Promise<Source> {
        const created = await this.inner.createSource(provider);
        try {
            await this.writeProvider(created);
        } catch (error) {
            await this.inner.deleteSource(provider.urn);
            throw error;
        }
        return created;
    }

    async updateSource(provider: Source): Promise<Source | null> {
        const previous = await this.inner.getSource(provider.urn);
        const updated = await this.inner.updateSource(provider);
        if (!updated) return null;
        try {
            await this.writeProvider(updated);
        } catch (error) {
            if (previous) await this.inner.updateSource(previous);
            throw error;
        }
        return updated;
    }

    async deleteSource(urn: string): Promise<boolean> {
        const deleted = await this.inner.deleteSource(urn);
        if (!deleted) return false;
        await unlink(this.fileFor(urn)).catch((error: { code?: string }) => {
            if (error.code !== "ENOENT") throw error;
        });
        return true;
    }

    getSource(urn: string) {
        return this.inner.getSource(urn);
    }

    getAllSources() {
        return this.inner.getAllSources();
    }

    getEndpoint(urn: string) {
        return this.inner.getEndpoint(urn);
    }

    private async writeProvider(provider: Source): Promise<void> {
        await mkdir(this.dir, { recursive: true });
        await writeFile(this.fileFor(provider.urn), `${JSON.stringify(provider, null, 4)}\n`, "utf-8");
    }

    private fileFor(urn: string): string {
        const id = parseUrn(urn)?.source ?? urn.replace(/[^a-zA-Z0-9_-]+/g, "-");
        return join(this.dir, `${id}.json`);
    }
}
