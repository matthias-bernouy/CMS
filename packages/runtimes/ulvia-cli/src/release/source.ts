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
    const files = await readAssetFiles(directory);
    const seenIds = new Set<string>();
    const seenSources = new Set<string>();
    const bundle: { id: string; bytes: Uint8Array }[] = [];
    const definitions = [];
    for (const [index, value] of declarations.entries()) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`Collection source asset ${index} must be an object`);
        }
        const source = value as Record<string, unknown>;
        if (Object.keys(source).some((key) => !["id", "source", "generation", "mediaType"].includes(key))) {
            throw new Error(`Collection source asset ${index} accepts only id, source, generation and mediaType`);
        }
        if (
            typeof source.id !== "string" ||
            source.id.length > 96 ||
            !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(source.id) ||
            typeof source.mediaType !== "string" ||
            seenIds.has(source.id)
        ) {
            throw new Error(`Collection source asset ${index} requires a unique id and mediaType`);
        }
        const sourcePath = collectionAssetSourcePath(source.source, source.id, index);
        if (seenSources.has(sourcePath)) {
            throw new Error(`Collection source asset ${index} reuses source ${sourcePath}`);
        }
        seenIds.add(source.id);
        seenSources.add(sourcePath);
        const bytes = await readFile(join(directory, ...sourcePath.split("/")));
        bundle.push({ id: source.id, bytes });
        definitions.push({
            id: source.id,
            ...(source.generation === undefined ? {} : { generation: source.generation }),
            mediaType: source.mediaType,
            byteLength: bytes.byteLength,
            digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        });
    }
    const extras = files.filter((file) => !seenSources.has(file));
    if (extras.length || files.filter((file) => seenSources.has(file)).length !== declarations.length) {
        throw new Error("Collection assets directory must exactly match the source declarations");
    }
    return { definitions, bundle };
}

function collectionAssetSourcePath(value: unknown, fallback: string, index: number): string {
    const source = value === undefined ? fallback : value;
    if (typeof source !== "string" || source.length === 0 || source.length > 512 || source.includes("\\")) {
        throw new Error(`Collection source asset ${index} has an invalid source path`);
    }
    const segments = source.split("/");
    if (
        source.startsWith("/") ||
        segments.some(
            (segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment) || segment === "." || segment === "..",
        )
    ) {
        throw new Error(`Collection source asset ${index} has an invalid source path`);
    }
    return source;
}

async function readAssetFiles(directory: string, prefix = ""): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readEntries(directory)) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...(await readAssetFiles(join(directory, entry.name), path)));
        } else if (entry.isFile()) {
            if (entry.name !== ".gitkeep") {
                files.push(path);
            }
        } else {
            throw new Error(`Collection assets contain an unsupported entry: ${path}`);
        }
    }
    return files.sort();
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
