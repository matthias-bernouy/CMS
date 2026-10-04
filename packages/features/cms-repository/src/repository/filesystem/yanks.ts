import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RepositoryArtifactKind } from "cms-repository/repository/publication/types";

export type { RepositoryArtifactKind } from "cms-repository/repository/publication/types";
export type RepositoryYank = Readonly<{ reason: string; yankedAt: string }>;

type YankDocument = Readonly<{
    schema: "ulvia.repository-yanks.v1";
    entries: Readonly<Record<string, RepositoryYank>>;
}>;

export class LocalRepositoryYanks {
    constructor(private readonly root: string) {}

    async get(kind: RepositoryArtifactKind, publisherId: string, id: string, version: string) {
        return (await this.read()).entries[key(kind, publisherId, id, version)] ?? null;
    }

    async entries(kind?: RepositoryArtifactKind) {
        const entries = Object.entries((await this.read()).entries)
            .map(([coordinate, yank]) => ({ coordinate, yank }))
            .filter((entry) => !kind || entry.coordinate.startsWith(`${kind}\0`));
        return entries.sort((left, right) => left.coordinate.localeCompare(right.coordinate));
    }

    async set(
        kind: RepositoryArtifactKind,
        publisherId: string,
        id: string,
        version: string,
        reason: string | null,
    ): Promise<RepositoryYank | null> {
        const document = await this.read();
        const entries = { ...document.entries };
        const coordinate = key(kind, publisherId, id, version);
        if (reason === null) {
            delete entries[coordinate];
        } else {
            const normalized = reason.trim();
            if (!normalized || normalized.length > 1_024) {
                throw new Error("Yank reason must contain between 1 and 1024 characters");
            }
            entries[coordinate] = Object.freeze({ reason: normalized, yankedAt: new Date().toISOString() });
        }
        await this.write({ schema: "ulvia.repository-yanks.v1", entries });
        return entries[coordinate] ?? null;
    }

    private async read(): Promise<YankDocument> {
        const bytes = await readFile(this.path(), "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (bytes === null) {
            return { schema: "ulvia.repository-yanks.v1", entries: {} };
        }
        const value = JSON.parse(bytes) as Partial<YankDocument>;
        if (value.schema !== "ulvia.repository-yanks.v1" || !validEntries(value.entries)) {
            throw new Error("Invalid repository yank metadata");
        }
        return value as YankDocument;
    }

    private async write(document: YankDocument): Promise<void> {
        const path = this.path();
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        try {
            await rename(temporary, path);
        } finally {
            await rm(temporary, { force: true });
        }
    }

    private path(): string {
        return join(this.root, "metadata", "yanks.json");
    }
}

function key(kind: RepositoryArtifactKind, publisherId: string, id: string, version: string): string {
    return `${kind}\0${publisherId}\0${id}\0${version}`;
}

function validEntries(value: unknown): value is Record<string, RepositoryYank> {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.entries(value).every(
            ([coordinate, yank]) =>
                coordinate.split("\0").length === 4 &&
                yank !== null &&
                typeof yank === "object" &&
                !Array.isArray(yank) &&
                Object.keys(yank).every((key) => key === "reason" || key === "yankedAt") &&
                typeof (yank as RepositoryYank).reason === "string" &&
                (yank as RepositoryYank).reason.length > 0 &&
                (yank as RepositoryYank).reason.length <= 1_024 &&
                typeof (yank as RepositoryYank).yankedAt === "string" &&
                Number.isFinite(Date.parse((yank as RepositoryYank).yankedAt)),
        )
    );
}
