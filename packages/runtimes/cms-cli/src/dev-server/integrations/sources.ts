import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
    CompositeSourceRepository,
    InMemorySourceRepository,
    parseUrn,
    seedSources,
    SYSTEM_SOURCES,
    type Source,
    type SourceRepository,
    ValidatingSourceRepository,
} from "@bernouy/cms-sources";
import { GENERATED_SOURCES_DIR } from "./paths";

/**
 * Generated source contracts are integration artifacts. They are reviewable,
 * but not an authoring surface: authored imports live in `site/integrations/`.
 */
export async function loadGeneratedSources(siteDir: string): Promise<Source[]> {
    const dir = join(siteDir, GENERATED_SOURCES_DIR);
    if (!existsSync(dir)) return [];

    let entries: string[];
    try { entries = await readdir(dir); }
    catch { return []; }

    const sources: Source[] = [];
    for (const entry of entries.sort()) {
        if (!entry.endsWith(".json")) continue;
        try {
            sources.push(JSON.parse(await readFile(join(dir, entry), "utf-8")) as Source);
        } catch (error) {
            console.warn(`[integrations] skipped generated source ${entry}: ${message(error)}`);
        }
    }
    return sources;
}

export async function createDevSources(siteDir: string): Promise<SourceRepository> {
    const sources = new CompositeSourceRepository(
        new ValidatingSourceRepository(new LocalFsGeneratedSourceRepository(siteDir)),
        SYSTEM_SOURCES,
    );
    const generated = await loadGeneratedSources(siteDir);
    if (generated.length > 0) {
        const { created, skipped } = await seedSources(sources, generated);
        const suffix = skipped.length ? `, ${skipped.length} skipped` : "";
        console.log(`-> Sources : ${created.length} generated loaded${suffix} (${generated.map(s => s.urn).join(", ")})`);
    }
    return sources;
}

export class LocalFsGeneratedSourceRepository implements SourceRepository {
    private readonly inner = new InMemorySourceRepository();
    private readonly dir: string;

    constructor(siteDir: string) {
        this.dir = join(siteDir, GENERATED_SOURCES_DIR);
    }

    async createSource(source: Source): Promise<Source> {
        const created = await this.inner.createSource(source);
        try {
            await this.writeSource(created);
        } catch (error) {
            await this.inner.deleteSource(source.urn);
            throw error;
        }
        return created;
    }

    async updateSource(source: Source): Promise<Source | null> {
        const previous = await this.inner.getSource(source.urn);
        const updated = await this.inner.updateSource(source);
        if (!updated) return null;
        try {
            await this.writeSource(updated);
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

    private async writeSource(source: Source): Promise<void> {
        await mkdir(this.dir, { recursive: true });
        await writeFile(this.fileFor(source.urn), `${JSON.stringify(source, null, 4)}\n`, "utf-8");
    }

    private fileFor(urn: string): string {
        const id = parseUrn(urn)?.source ?? urn.replace(/[^a-zA-Z0-9_-]+/g, "-");
        return join(this.dir, `${id}.json`);
    }
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
