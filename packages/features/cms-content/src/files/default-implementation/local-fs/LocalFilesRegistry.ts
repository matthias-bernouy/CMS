import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

export type RegistryEntry = { path: string; hash: string | null };
export type FilesRegistry = {
    version: 1;
    byId: Record<string, RegistryEntry>;
    byPath: Record<string, string>;
};

export type ReconcileResult = {
    healed: { uuid: string; from: string; to: string }[];
    minted: { uuid: string; path: string }[];
    deleted: { uuid: string; path: string }[];
    errors: { path: string; error: string }[];
};

export type ReconcileOptions = {
    /** Discard the existing registry first, then rebuild from disk. */
    force?: boolean;
};

export const CMS_FILES_REGISTRY_NAME = ".cms-files-registry.json";

export class LocalFilesRegistry {
    readonly registryPath: string;
    data: FilesRegistry | null = null;
    dirty = false;

    constructor(readonly root: string) {
        this.registryPath = join(root, "..", CMS_FILES_REGISTRY_NAME);
    }

    abs(path: string): string {
        const segments = path.split("/").filter(Boolean);
        if (segments.some((segment) => segment === "..")) {
            throw new Error(`invalid path "${path}"`);
        }
        return join(this.root, ...segments);
    }

    async reset(): Promise<void> {
        await this.assertRegistryPlacement();
        await rm(this.registryPath, { force: true });
        this.data = emptyRegistry();
        this.dirty = false;
    }

    async ensure(): Promise<void> {
        if (this.data) {
            return;
        }
        await this.assertRegistryPlacement();
        const file = Bun.file(this.registryPath);
        if (!(await file.exists())) {
            this.data = emptyRegistry();
            return;
        }
        let parsed: { byId?: FilesRegistry["byId"]; byPath?: FilesRegistry["byPath"] };
        try {
            parsed = JSON.parse(await file.text());
        } catch {
            throw new Error(
                `Corrupt files registry at ${this.registryPath}. Restore it with ` +
                    `\`git checkout ${CMS_FILES_REGISTRY_NAME}\`, or rebuild from disk with \`p9r files reindex --force\`.`,
            );
        }
        this.data = { version: 1, byId: parsed.byId ?? {}, byPath: parsed.byPath ?? {} };
    }

    async flush(): Promise<void> {
        if (!this.dirty) {
            return;
        }
        await this.save();
        this.dirty = false;
    }

    async save(): Promise<void> {
        const registry = this.data!;
        const temporaryPath = this.registryPath + ".tmp";
        await mkdir(join(this.root, ".."), { recursive: true });
        await Bun.write(
            temporaryPath,
            JSON.stringify({ version: 1, byId: registry.byId, byPath: registry.byPath }, null, 2) + "\n",
        );
        await rename(temporaryPath, this.registryPath);
    }

    private async assertRegistryPlacement(): Promise<void> {
        if (await Bun.file(join(this.root, CMS_FILES_REGISTRY_NAME)).exists()) {
            throw new Error(
                `${CMS_FILES_REGISTRY_NAME} must live beside files/, not inside it (move it to the site root).`,
            );
        }
    }
}

function emptyRegistry(): FilesRegistry {
    return { version: 1, byId: {}, byPath: {} };
}
