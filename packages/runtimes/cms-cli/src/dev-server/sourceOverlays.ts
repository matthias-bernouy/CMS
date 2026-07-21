import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SourceOverlay, SourceOverlayRepository } from "@bernouy/cms-sources";

const SOURCE_OVERLAYS_FILE = ".p9r/source-overlays.json";

export class LocalFsSourceOverlayRepository implements SourceOverlayRepository {
    private readonly file: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, SOURCE_OVERLAYS_FILE);
    }

    async getOverlay(id: string): Promise<SourceOverlay | null> {
        const overlay = (await this.readAll()).find((candidate) => candidate.id === id);
        return overlay ? structuredClone(overlay) : null;
    }

    async getOverlaysForSource(sourceId: string): Promise<SourceOverlay[]> {
        return (await this.readAll())
            .filter((overlay) => overlay.sourceId === sourceId)
            .map((overlay) => structuredClone(overlay));
    }

    async getAllOverlays(): Promise<SourceOverlay[]> {
        return (await this.readAll()).map((overlay) => structuredClone(overlay));
    }

    async upsertOverlay(overlay: SourceOverlay): Promise<SourceOverlay> {
        const overlays = await this.readAll();
        const next = structuredClone(overlay);
        const index = overlays.findIndex((candidate) => candidate.id === next.id);
        if (index >= 0) {
            overlays[index] = next;
        } else {
            overlays.push(next);
        }
        await this.writeAll(overlays);
        return structuredClone(next);
    }

    async deleteOverlay(id: string): Promise<boolean> {
        const overlays = await this.readAll();
        const next = overlays.filter((overlay) => overlay.id !== id);
        if (next.length === overlays.length) {
            return false;
        }
        await this.writeAll(next);
        return true;
    }

    private async readAll(): Promise<SourceOverlay[]> {
        if (!existsSync(this.file)) {
            return [];
        }
        const parsed = JSON.parse(await readFile(this.file, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(isOverlay).map((overlay) => structuredClone(overlay));
    }

    private async writeAll(overlays: SourceOverlay[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        const sorted = [...overlays].sort((left, right) => left.id.localeCompare(right.id));
        await writeFile(this.file, `${JSON.stringify(sorted, null, 4)}\n`, "utf-8");
    }
}

function isOverlay(value: unknown): value is SourceOverlay {
    return (
        !!value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { sourceId?: unknown }).sourceId === "string" &&
        Array.isArray((value as { fields?: unknown }).fields)
    );
}
