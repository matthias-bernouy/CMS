import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { admitCollectionRelease, isCollectionNamespace } from "@bernouy/cms-repository/collections";
import { loadCollectionBlocs } from "./blocSources";
import { loadCollectionTheme, loadCollectionTranslations } from "./metadataSources";
import { loadCollectionTexts } from "./textSources";
import { assertCollectionSourceQuality } from "./quality";
import { loadCollectionMigrations } from "./migrationSources";

/** Compile one authored folder into an immutable, admitted release candidate. */
export async function prepareCollectionRelease(directory: string) {
    const collectionRoot = resolve(directory);
    const collectionId = basename(collectionRoot);
    if (!isCollectionNamespace(collectionId)) {
        throw new Error("Invalid collection ID");
    }
    const definition = (await Bun.file(join(collectionRoot, "definition.json")).json()) as Record<string, unknown>;
    const translations = await loadCollectionTranslations(join(collectionRoot, "translations"));
    const blocs = await loadCollectionBlocs(join(collectionRoot, "blocs"), String(definition.name ?? collectionId));
    const texts = await loadCollectionTexts(join(collectionRoot, "texts"));
    const views = await loadViews(join(collectionRoot, "views"));
    const dashboards = await loadDashboards(join(collectionRoot, "dashboards"));
    const theme = await loadCollectionTheme(join(collectionRoot, "theme"));
    const migrations = await loadCollectionMigrations(join(collectionRoot, "migrations"));
    const assets = await loadAssets(join(collectionRoot, "assets"), definition.assets);
    const candidate = {
        ...definition,
        translations,
        assets: assets.definitions,
        blocs,
        migrations,
        ...(texts.length ? { texts } : {}),
        ...(views.length ? { views } : {}),
        ...(dashboards.length ? { dashboards } : {}),
        ...(theme === undefined ? {} : { theme }),
    };
    const artifact = await admitCollectionRelease(candidate, assets.bundle);
    assertCollectionSourceQuality(artifact.release);
    if (artifact.release.collectionId !== collectionId) {
        throw new Error(`Collection folder ${collectionId} does not match its definition`);
    }
    return artifact;
}

async function loadAssets(directory: string, value: unknown) {
    const declarations = value === undefined ? [] : value;
    if (!Array.isArray(declarations)) {
        throw new Error("Collection source assets must be an array");
    }
    const files = (await readEntries(directory)).filter((entry) => entry.isFile()).map((entry) => entry.name);
    const seen = new Set<string>();
    const bundle: { id: string; bytes: Uint8Array }[] = [];
    const definitions = [];
    for (const [index, value] of declarations.entries()) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`Collection source asset ${index} must be an object`);
        }
        const source = value as Record<string, unknown>;
        if (Object.keys(source).some((key) => !["id", "generation", "mediaType"].includes(key))) {
            throw new Error(`Collection source asset ${index} accepts only id, generation and mediaType`);
        }
        if (
            typeof source.id !== "string" ||
            source.id.length > 96 ||
            !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(source.id) ||
            typeof source.mediaType !== "string" ||
            seen.has(source.id)
        ) {
            throw new Error(`Collection source asset ${index} requires a unique id and mediaType`);
        }
        seen.add(source.id);
        const bytes = await readFile(join(directory, source.id));
        bundle.push({ id: source.id, bytes });
        definitions.push({
            id: source.id,
            ...(source.generation === undefined ? {} : { generation: source.generation }),
            mediaType: source.mediaType,
            byteLength: bytes.byteLength,
            digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        });
    }
    const extras = files.filter((file) => !seen.has(file) && file !== ".gitkeep");
    if (extras.length || files.filter((file) => seen.has(file)).length !== declarations.length) {
        throw new Error("Collection assets directory must exactly match the source declarations");
    }
    return { definitions, bundle };
}

async function loadDashboards(directory: string): Promise<unknown[]> {
    const folders = (await readEntries(directory)).filter((entry) => entry.isDirectory());
    return Promise.all(
        folders
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(async (folder) => {
                const definition = (await Bun.file(join(directory, folder.name, "definition.json")).json()) as Record<
                    string,
                    unknown
                >;
                if (definition.id !== folder.name) {
                    throw new Error(`Dashboard folder ${folder.name} must match its definition`);
                }
                return definition;
            }),
    );
}

async function loadViews(directory: string): Promise<unknown[]> {
    const folders = (await readEntries(directory)).filter((entry) => entry.isDirectory());
    return Promise.all(
        folders
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(async (folder) => {
                const root = join(directory, folder.name);
                const definition = (await Bun.file(join(root, "definition.json")).json()) as Record<string, unknown>;
                if (definition.id !== folder.name || Object.hasOwn(definition, "html")) {
                    throw new Error(`View folder ${folder.name} must match its definition and keep HTML separate`);
                }
                return { ...definition, html: (await Bun.file(join(root, "view.html")).text()).trim() };
            }),
    );
}

async function readEntries(directory: string) {
    return readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
}
