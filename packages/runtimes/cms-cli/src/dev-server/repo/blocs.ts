import type { BlocListItemResponse } from "@bernouy/cms-content";
import type { BuiltBloc } from "../bloc-build/index";
import { bundleBlocSource } from "cms-cli/push/blocs/bundle";
import type { TBloc } from "@bernouy/cms-content";
import { ContentValidationError, DuplicateBlocTagError } from "@bernouy/cms-content";
import { buildDevBloc } from "cms-cli/dev-server/bloc-build/index";
import { scanDevBlocs } from "cms-cli/dev-server/scan";
import { categoryToFolder } from "cms-cli/push/shared/categoryFolder";
import { safeJoin } from "cms-cli/push/shared/safeJoin";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type BlocsStoreOptions = {
    rootDir?: string;
};

/**
 * Filesystem-backed bloc store. Reads from a shared `built` map populated
 * up-front by `CLI_dev` and mutated in place by the file watcher: when a
 * bloc rebuilds, the new bundle replaces the old entry and subsequent
 * repo calls see it instantly. The shared map IS the cache; "invalidation"
 * is just the watcher swapping a value.
 *
 * Writes persist source bundles back to `site/blocs/<group>/<tag>/`, then
 * build the freshly written source immediately so the current request can see
 * the new bloc before the watcher polling loop catches up.
 */
export class BlocsStore {
    private readonly rootDir: string;

    constructor(
        private readonly siteDir: string,
        private readonly built: Map<string, BuiltBloc>,
        options: BlocsStoreOptions = {},
    ) {
        this.rootDir = options.rootDir ?? "blocs";
    }

    async getAllJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return [...this.built.values()].map((b) => ({
            id: b.tag,
            editorJS: b.editorJS ?? "",
            viewJS: b.viewJS,
        }));
    }

    async getList(): Promise<BlocListItemResponse[]> {
        return [...this.built.values()].map((b) => ({
            id: b.tag,
            name: b.label,
            group: b.group,
            description: b.description,
        }));
    }

    async getViewJS(tag: string): Promise<string | null> {
        return this.built.get(tag)?.viewJS ?? null;
    }

    async getSource(tag: string): Promise<Record<string, string> | null> {
        const folder = this.built.get(tag)?.folder;
        if (!folder) {
            return null;
        }
        return await bundleBlocSource(folder);
    }

    async create(bloc: TBloc): Promise<TBloc> {
        if (this.built.has(bloc.id)) {
            throw new DuplicateBlocTagError(bloc.id);
        }
        return await this.write(bloc);
    }

    async replace(bloc: TBloc): Promise<TBloc> {
        return await this.write(bloc);
    }

    private async write(bloc: TBloc): Promise<TBloc> {
        const source = bloc.source;
        if (!source || Object.keys(source).length === 0) {
            throw new ContentValidationError("source", "`p9r dev` bloc writes require an editable source bundle");
        }

        const target = safeJoin(this.siteDir, this.rootDir, categoryToFolder(bloc.group), bloc.id);
        await rm(target, { recursive: true, force: true });
        await writeBlocSource(target, source);

        const scanned = await scanDevBlocs(target, { quiet: true });
        const devBloc = scanned.find((candidate) => candidate.tag === bloc.id);
        if (!devBloc) {
            throw new ContentValidationError("source", `written source did not produce bloc "${bloc.id}"`);
        }

        const built = await buildDevBloc(devBloc);
        this.built.set(built.tag, built);
        return bloc;
    }
}

async function writeBlocSource(target: string, source: Record<string, string>): Promise<void> {
    for (const [rel, base64] of Object.entries(source)) {
        if (rel === "" || rel.includes("\0")) {
            throw new ContentValidationError("source", `invalid source path "${rel}"`);
        }

        const full = safeJoin(target, rel);
        await mkdir(dirname(full), { recursive: true });
        const bytes =
            rel === "manifest.json" || rel === "./manifest.json"
                ? Buffer.from(stripLegacyManifestFields(Buffer.from(base64, "base64").toString("utf-8")), "utf-8")
                : Buffer.from(base64, "base64");
        await writeFile(full, bytes);
    }
}

function stripLegacyManifestFields(raw: string): string {
    let manifest: Record<string, unknown>;
    try {
        manifest = JSON.parse(raw);
    } catch {
        return raw;
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        return raw;
    }
    if (!("default-group" in manifest)) {
        return raw;
    }
    delete manifest["default-group"];
    return JSON.stringify(manifest, null, 4) + "\n";
}
