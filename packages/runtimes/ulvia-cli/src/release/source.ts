import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { sha256Digest } from "@bernouy/binary-media";
import { admitCollectionRelease, isCollectionNamespace } from "@bernouy/cms-repository/collections";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { loadCollectionBlocs } from "./blocSources";
import { expandCollectionSourceExports, loadCollectionTheme, loadCollectionTranslations } from "./metadataSources";
import { loadCollectionTexts } from "./textSources";
import { assertCollectionSourceQuality } from "./quality";
import { loadCollectionMigrations } from "./migrationSources";
import { readSourceEntries, scanFileSourceTree } from "./sourceTree";

/** Compile one authored folder into an immutable, admitted release candidate. */
export async function prepareCollectionRelease(directory: string, contracts?: ReleaseCatalogue) {
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
    const theme = await loadCollectionTheme(join(collectionRoot, "theme"));
    const migrations = await loadCollectionMigrations(join(collectionRoot, "migrations"));
    const assets = await loadAssets(join(collectionRoot, "assets"), definition.assets);
    const exports = expandCollectionSourceExports(definition.exports, {
        blocs: ids(blocs, (bloc) => bloc.internal !== true),
        themeTokens: themeTokenIds(theme),
        texts: ids(texts),
        assets: ids(assets.definitions),
    });
    const candidate = {
        ...definition,
        ...(exports === undefined ? {} : { exports }),
        translations,
        assets: assets.definitions,
        blocs,
        migrations,
        ...(texts.length ? { texts } : {}),
        ...(views.length ? { views } : {}),
        ...(theme === undefined ? {} : { theme }),
    };
    const artifact = await admitCollectionRelease(candidate, assets.bundle, { contracts });
    assertCollectionSourceQuality(artifact.release);
    if (artifact.release.collectionId !== collectionId) {
        throw new Error(`Collection folder ${collectionId} does not match its definition`);
    }
    return artifact;
}

function ids(values: readonly unknown[], include: (value: Record<string, unknown>) => boolean = () => true): string[] {
    return values.flatMap((value) => {
        const record = value as Record<string, unknown>;
        return typeof record?.id === "string" && include(record) ? [record.id] : [];
    });
}

function themeTokenIds(value: unknown): string[] {
    const categories = (value as { categories?: { tokens?: unknown[] }[] } | undefined)?.categories ?? [];
    return categories.flatMap((category) => ids(category.tokens ?? []));
}

async function loadAssets(directory: string, value: unknown) {
    const declarations = value === undefined ? [] : value;
    if (!Array.isArray(declarations)) {
        throw new Error("Collection source assets must be an array");
    }
    const files = (await scanFileSourceTree(directory)).map(({ relativePath }) => relativePath);
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
            digest: await sha256Digest(bytes),
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

async function loadViews(directory: string): Promise<unknown[]> {
    const entries = (await readEntries(directory)).filter((entry) => entry.name !== ".gitkeep");
    if (entries.some((entry) => !entry.isDirectory())) {
        throw new Error("View source root may contain only view directories");
    }
    const folders = entries;
    return Promise.all(
        folders
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(async (folder) => {
                const root = join(directory, folder.name);
                await assertExactEntries(root, ["definition.json", "view.html"]);
                const definition = (await Bun.file(join(root, "definition.json")).json()) as Record<string, unknown>;
                if (definition.id !== folder.name || Object.hasOwn(definition, "html")) {
                    throw new Error(`View folder ${folder.name} must match its definition and keep HTML separate`);
                }
                return { ...definition, html: (await Bun.file(join(root, "view.html")).text()).trim() };
            }),
    );
}

async function assertExactEntries(directory: string, expected: readonly string[]): Promise<void> {
    const entries = (await readSourceEntries(directory)).filter((entry) => entry.name !== ".gitkeep");
    if (
        entries.length !== expected.length ||
        entries.some((entry) => !entry.isFile() || !expected.includes(entry.name))
    ) {
        throw new Error(`${directory} must contain exactly ${expected.join(" and ")}`);
    }
}

async function readEntries(directory: string) {
    return readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
}
