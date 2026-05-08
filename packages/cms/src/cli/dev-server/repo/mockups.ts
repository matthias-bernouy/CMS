import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TDataMockup } from "src/socle/interfaces/Data/data";
import {
    deleteFileAndPrune,
    MOCKUP_FOLDER,
    mockupFile,
    walkProviderMockups,
} from "src/cli/push/shared/mockupsLayout";

/**
 * Filesystem-backed mockup store.
 *
 *   <siteDir>/mockups/<providerId>/<path-segments>/<METHOD>/<name>.json
 *
 * The layout mirrors the OpenAPI mental model so git diffs stay scoped
 * to one operation when only one mockup changes. See
 * `cli/push/shared/mockupsLayout.ts` for the path-encoding rules.
 */
export class MockupsStore {
    constructor(private readonly siteDir: string) {}

    async listFor(providerId: string): Promise<TDataMockup[]> {
        const root = this._root();
        const descriptors = await walkProviderMockups(root, providerId);
        const out: TDataMockup[] = [];
        for (const d of descriptors) out.push(await this._read(providerId, d.file));
        return out;
    }

    async get(providerId: string, method: string, path: string, name: string): Promise<TDataMockup | null> {
        const file = mockupFile(this._root(), providerId, method, path, name);
        if (!existsSync(file)) return null;
        return this._read(providerId, file);
    }

    async getActive(providerId: string, method: string, path: string): Promise<TDataMockup | null> {
        const m = method.toUpperCase();
        for (const mockup of await this.listFor(providerId)) {
            if (mockup.active && mockup.method === m && mockup.path === path) return mockup;
        }
        return null;
    }

    async create(input: Omit<TDataMockup, "updatedAt" | "active">): Promise<TDataMockup> {
        const method = input.method.toUpperCase();
        const file   = mockupFile(this._root(), input.providerId, method, input.path, input.name);
        if (existsSync(file)) {
            throw new Error(`Mockup "${input.name}" already exists for ${method} ${input.path}`);
        }
        const isFirst = !(await this.getActive(input.providerId, method, input.path));
        const stored: TDataMockup = { ...input, method, active: isFirst, updatedAt: new Date() };
        await this._write(stored);
        return stored;
    }

    async update(providerId: string, method: string, path: string, name: string, patch: Partial<Pick<TDataMockup, "status" | "body" | "name">>): Promise<TDataMockup | null> {
        const m = method.toUpperCase();
        const existing = await this.get(providerId, m, path, name);
        if (!existing) return null;
        const newName = patch.name ?? existing.name;
        if (newName !== name) {
            const conflict = await this.get(providerId, m, path, newName);
            if (conflict) throw new Error(`Mockup "${newName}" already exists for ${m} ${path}`);
        }
        const updated: TDataMockup = {
            ...existing,
            status:    patch.status ?? existing.status,
            body:      patch.body   ?? existing.body,
            name:      newName,
            updatedAt: new Date(),
        };
        if (newName !== name) {
            await deleteFileAndPrune(mockupFile(this._root(), providerId, m, path, name), this._dirFor(providerId));
        }
        await this._write(updated);
        return updated;
    }

    async delete(providerId: string, method: string, path: string, name: string): Promise<void> {
        const m        = method.toUpperCase();
        const existing = await this.get(providerId, m, path, name);
        if (!existing) return;
        await deleteFileAndPrune(mockupFile(this._root(), providerId, m, path, name), this._dirFor(providerId));
        if (existing.active) {
            const replacement = (await this.listFor(providerId))
                .find(x => x.method === m && x.path === path);
            if (replacement) {
                await this._write({ ...replacement, active: true, updatedAt: new Date() });
            }
        }
    }

    async setActive(providerId: string, method: string, path: string, name: string | null): Promise<void> {
        const m     = method.toUpperCase();
        const peers = (await this.listFor(providerId)).filter(x => x.method === m && x.path === path);
        for (const p of peers) {
            const shouldBeActive = name !== null && p.name === name;
            if (p.active !== shouldBeActive) {
                await this._write({ ...p, active: shouldBeActive, updatedAt: new Date() });
            }
        }
    }

    async deleteAllFor(providerId: string): Promise<void> {
        const dir = this._dirFor(providerId);
        if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    }

    private async _read(providerId: string, file: string): Promise<TDataMockup> {
        const raw    = await readFile(file, "utf-8");
        const parsed = JSON.parse(raw) as Partial<TDataMockup> & { updatedAt?: string };
        return {
            providerId,
            method:    String(parsed.method ?? "GET").toUpperCase(),
            path:      String(parsed.path   ?? "/"),
            name:      String(parsed.name   ?? ""),
            status:    Number(parsed.status ?? 200),
            body:      String(parsed.body   ?? "{}"),
            active:    Boolean(parsed.active),
            updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(0),
        };
    }

    private async _write(m: TDataMockup): Promise<void> {
        const file = mockupFile(this._root(), m.providerId, m.method, m.path, m.name);
        await mkdir(dirname(file), { recursive: true });
        const { providerId: _p, ...persistable } = m;
        const json = JSON.stringify({ ...persistable, updatedAt: m.updatedAt.toISOString() }, null, 4) + "\n";
        await writeFile(file, json, "utf-8");
    }

    private _root():                     string { return join(this.siteDir, MOCKUP_FOLDER); }
    private _dirFor(providerId: string): string { return join(this._root(), providerId); }
}
