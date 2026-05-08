import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TDataProvider, TDataProviderListItem } from "src/socle/interfaces/Data/data";
import { isValidDataProviderId } from "src/socle/utils/validation";

const FOLDER         = "data-providers";
const FROZEN_DATE    = new Date(0);

/**
 * Filesystem-backed data provider store. Each provider lives at
 * `<siteDir>/data-providers/<id>.json`. The filename IS the id — agreement
 * is verified on read so renames stay obvious. Secrets (bearer tokens,
 * header values) are written in clear; the planned ENV VARIABLE settings
 * tab will replace them with `${VAR}` references over time.
 */
export class DataProvidersStore {
    constructor(private readonly siteDir: string) {}

    async getAll(): Promise<TDataProvider[]> {
        const dir = this._dir();
        if (!existsSync(dir)) return [];
        const files = (await readdir(dir)).filter(f => f.endsWith(".json") && !f.startsWith("."));
        const out: TDataProvider[] = [];
        for (const file of files) {
            const id = file.slice(0, -".json".length);
            if (!isValidDataProviderId(id)) continue;
            out.push(await this._read(id));
        }
        return out;
    }

    async getById(id: string): Promise<TDataProvider | null> {
        const file = this._fileFor(id);
        if (!existsSync(file)) return null;
        return this._read(id);
    }

    async create(provider: Omit<TDataProvider, "createdAt" | "lastSyncAt">): Promise<TDataProvider> {
        const file = this._fileFor(provider.id);
        if (existsSync(file)) throw new Error(`Data provider "${provider.id}" already exists`);
        const stored: TDataProvider = { ...provider, createdAt: FROZEN_DATE, lastSyncAt: null };
        await this._write(stored);
        return stored;
    }

    async update(id: string, data: Partial<TDataProvider>): Promise<TDataProvider | null> {
        const existing = await this.getById(id);
        if (!existing) return null;
        // `id` is immutable on disk (filename = id). Strip any attempt to change it.
        const { id: _ignored, createdAt: __, ...rest } = data;
        const merged: TDataProvider = { ...existing, ...rest, id: existing.id };
        await this._write(merged);
        return merged;
    }

    async delete(id: string): Promise<void> {
        const file = this._fileFor(id);
        if (existsSync(file)) await unlink(file);
    }

    async list(): Promise<TDataProviderListItem[]> {
        return (await this.getAll()).map(p => ({
            id:            p.id,
            name:          p.name,
            source:        p.source,
            endpointCount: 0,
            lastSyncAt:    p.lastSyncAt ? p.lastSyncAt.toDateString() : "",
        }));
    }

    private _dir(): string                { return join(this.siteDir, FOLDER); }
    private _fileFor(id: string): string  { return join(this._dir(), `${id}.json`); }

    private async _read(id: string): Promise<TDataProvider> {
        const raw = await readFile(this._fileFor(id), "utf-8");
        const parsed = JSON.parse(raw) as Partial<TDataProvider>;
        if (parsed.id && parsed.id !== id) {
            throw new Error(`Data provider file ${id}.json declares id="${parsed.id}" — rename to match.`);
        }
        return {
            id,
            name:       String(parsed.name ?? ""),
            source:     (parsed.source ?? "url") as TDataProvider["source"],
            sourceUrl:  String(parsed.sourceUrl ?? ""),
            spec:       String(parsed.spec ?? ""),
            auth:       (parsed.auth ?? { type: "none" }) as TDataProvider["auth"],
            createdAt:  FROZEN_DATE,
            lastSyncAt: null,
        };
    }

    private async _write(p: TDataProvider): Promise<void> {
        await mkdir(this._dir(), { recursive: true });
        // Drop server-managed timestamps from the on-disk shape so the file
        // round-trips cleanly through pull/push without churning git.
        const { createdAt: _c, lastSyncAt: _l, ...persistable } = p;
        const json = JSON.stringify(persistable, null, 4) + "\n";
        await writeFile(this._fileFor(p.id), json, "utf-8");
    }
}
