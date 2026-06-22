import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { p9rExternalsPlugin } from "@bernouy/cms-bloc-compile";
import { DuplicateBlocTagError, P9R_CACHE, type CmsRepository, type TBloc } from "@bernouy/cms-content";
import type { Cache } from "@bernouy/http-runner";
import type { BunPlugin } from "bun";

type FoundationBlocSeed = {
    dir: string;
    componentExport: string;
    editorExport: string;
};

type FoundationBlocManifest = {
    "default-tag": string;
    bloc: string;
    editor: string;
    defaultContent: string;
    meta: {
        title: string;
        description: string;
        categories?: string[];
        icon?: string;
    };
};

type ResolvedFoundationBlocSeed = FoundationBlocSeed & {
    tag: string;
    name: string;
    group: string;
    description: string;
    componentPath: string;
    editorPath: string;
    icon: string;
    subCategory?: string;
    defaultContent: string;
};

const FOUNDATION_BLOCS: FoundationBlocSeed[] = [
    {
        dir:             "base-container",
        componentExport: "Container",
        editorExport:    "ContainerEditor",
    },
    {
        dir:             "base-card",
        componentExport: "Card",
        editorExport:    "CardEditor",
    },
    {
        dir:             "base-grid",
        componentExport: "Grid",
        editorExport:    "GridEditor",
    },
    {
        dir:             "base-photo-album",
        componentExport: "PhotoAlbum",
        editorExport:    "PhotoAlbumEditor",
    },
    {
        dir:             "base-skeleton",
        componentExport: "Skeleton",
        editorExport:    "SkeletonEditor",
    },
];

export async function seedFoundationBlocs(repository: CmsRepository, cache?: Cache): Promise<string[]> {
    const created: string[] = [];

    await Promise.all(FOUNDATION_BLOCS.map(async seed => {
        const resolved = await resolveFoundationBlocSeed(seed);
        if (await repository.getBlocViewJS(resolved.tag) !== null) return;

        const bloc = await buildFoundationBloc(resolved);
        try {
            await repository.createBloc(bloc);
            created.push(bloc.id);
        } catch (error) {
            if (!(error instanceof DuplicateBlocTagError)) throw error;
        }
    }));

    if (created.length > 0 && cache) {
        cache.delete(P9R_CACHE.EDITOR_SCRIPT);
        cache.delete(P9R_CACHE.EDITOR_VIEW_SCRIPT);
        cache.deleteMatching(key => key.startsWith(P9R_CACHE.BLOCSET_PREFIX));
        for (const tag of created) cache.delete(P9R_CACHE.bloc(tag));
    }

    return created;
}

async function resolveFoundationBlocSeed(seed: FoundationBlocSeed): Promise<ResolvedFoundationBlocSeed> {
    const dir = join(import.meta.dir, "defaultEditors", seed.dir);
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf-8")) as FoundationBlocManifest;
    const categories = manifest.meta.categories ?? [];

    return {
        ...seed,
        tag:            manifest["default-tag"],
        name:           manifest.meta.title,
        group:          categories[0] ?? "Content",
        description:    manifest.meta.description,
        componentPath:  join(dir, manifest.bloc),
        editorPath:     join(dir, manifest.editor),
        icon:           manifest.meta.icon ?? "box",
        subCategory:    categories[1],
        defaultContent: await readFile(join(dir, manifest.defaultContent), "utf-8"),
    };
}

async function buildFoundationBloc(seed: ResolvedFoundationBlocSeed): Promise<TBloc> {
    const [viewJS, editorJS] = await Promise.all([
        buildBrowserScript(viewSource(seed)),
        buildBrowserScript(editorSource(seed), [p9rExternalsPlugin]),
    ]);

    return {
        id:          seed.tag,
        name:        seed.name,
        group:       seed.group,
        description: seed.description,
        viewJS,
        editorJS,
        source:      await sourceBundle(seed),
    };
}

async function buildBrowserScript(source: string, plugins: BunPlugin[] = []) {
    const tempDir = await mkdtemp(join(tmpdir(), "base-foundation-bloc-"));
    try {
        const entry = join(tempDir, "entry.ts");
        await Bun.write(entry, source);
        const result = await Bun.build({
            entrypoints: [entry],
            target: "browser",
            format: "iife",
            plugins,
        });
        if (!result.success) {
            throw new Error(result.logs.map(log => log.message).join("\n") || "Failed to build foundation bloc.");
        }
        return await result.outputs[0]!.text();
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
}

function viewSource(seed: ResolvedFoundationBlocSeed): string {
    return `
import { ${seed.componentExport} } from ${JSON.stringify(seed.componentPath)};

if (!customElements.get(${JSON.stringify(seed.tag)})) {
    customElements.define(${JSON.stringify(seed.tag)}, ${seed.componentExport});
}
`;
}

function editorSource(seed: ResolvedFoundationBlocSeed): string {
    return `
import { registerEditor } from "@bernouy/cms-content/editor";
import { ${seed.editorExport} } from ${JSON.stringify(seed.editorPath)};

registerEditor({
    tag: ${JSON.stringify(seed.tag)},
    label: ${JSON.stringify(seed.name)},
    description: ${JSON.stringify(seed.description)},
    icon: ${JSON.stringify(seed.icon)},
    category: ${JSON.stringify(seed.group)},
    subCategory: ${JSON.stringify(seed.subCategory)},
    defaultContent: ${JSON.stringify(seed.defaultContent)},
    editor: ${seed.editorExport},
});
`;
}

async function sourceBundle(seed: ResolvedFoundationBlocSeed): Promise<Record<string, string>> {
    const dir = join(import.meta.dir, "defaultEditors", seed.dir);
    const entries = await readdir(dir, { withFileTypes: true });
    const source: Record<string, string> = {};

    await Promise.all(entries.map(async entry => {
        if (!entry.isFile()) return;

        const fileName = entry.name;
        source[fileName] = encodeSource(await readFile(join(dir, fileName), "utf-8"));
    }));

    return source;
}

function encodeSource(value: string): string {
    return Buffer.from(value, "utf-8").toString("base64");
}
