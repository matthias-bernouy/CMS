import { basename, dirname, join, resolve } from "node:path";
import { admitCollectionRelease, isCollectionNamespace } from "@bernouy/cms-repository/collections";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { loadCollectionExamples } from "../examples/source";
import { loadCollectionBlocs } from "./blocSources";
import { expandCollectionSourceExports, loadCollectionTheme, loadCollectionTranslations } from "./metadataSources";
import { loadCollectionTexts } from "./textSources";
import { readSourceEntries, scanFileSourceTree } from "cms-repository/repository/authoring/sourceTree";
import { loadCollectionAssets } from "./assetSources";

/** Compile one authored folder into an immutable, admitted release candidate. */
export async function prepareCollectionRelease(directory: string, contracts?: ReleaseCatalogue) {
    const collectionRoot = resolve(directory);
    const collectionId = basename(collectionRoot);
    if (!isCollectionNamespace(collectionId)) {
        throw new Error("Invalid collection ID");
    }
    const definition = (await Bun.file(join(collectionRoot, "definition.json")).json()) as Record<string, unknown>;
    const translations = await loadCollectionTranslations(join(collectionRoot, "translations"));
    const blocs = await loadCollectionBlocs(join(collectionRoot, "blocs"));
    const examples = await loadCollectionExamples(join(collectionRoot, "examples"));
    if (examples.length && definition.protocol !== "ulvia-collection/v1") {
        throw new Error("Example sources require collection v1");
    }
    const texts = await loadCollectionTexts(join(collectionRoot, "texts"));
    const pages = await loadPages(join(collectionRoot, "pages"));
    const theme = await loadCollectionTheme(join(collectionRoot, "theme"));
    if ((await readSourceEntries(collectionRoot)).some((entry) => entry.name === "migrations")) {
        throw new Error("Collection migration sources are unsupported");
    }
    if (Object.hasOwn(definition, "assets")) {
        throw new Error(
            "Collection source assets are discovered from assets/ and must not be declared in definition.json",
        );
    }
    if (Object.hasOwn(definition, "examples")) {
        throw new Error("Examples must be authored under examples/");
    }
    const assets = await loadCollectionAssets(join(collectionRoot, "assets"));
    const exports = expandCollectionSourceExports(definition.exports, {
        blocs: ids(blocs, (bloc) => bloc.catalogue !== "hidden"),
        themeTokens: themeTokenIds(theme),
        texts: ids(texts),
        assets: ids(assets.definitions),
        pages: ids(pages),
    });
    const candidate = {
        ...definition,
        ...(exports === undefined ? {} : { exports }),
        translations,
        assets: assets.definitions,
        blocs,
        examples,
        ...(texts.length ? { texts } : {}),
        ...(pages.length ? { pages } : {}),
        ...(theme === undefined ? {} : { theme }),
    };
    const artifact = await admitCollectionRelease(candidate, assets.bundle, { contracts });
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
    const categories =
        (value as { categories?: { entries?: Record<string, unknown>[] }[] } | undefined)?.categories ?? [];
    return categories.flatMap((category) =>
        ids((category.entries ?? []).filter((entry) => entry.type !== "font-face")),
    );
}

async function loadPages(directory: string): Promise<unknown[]> {
    const groups = new Map<string, Map<string, string>>();
    for (const file of await scanFileSourceTree(directory)) {
        const folder = dirname(file.relativePath);
        if (folder === ".") {
            throw new Error("Page source root may contain only page directories");
        }
        const files = groups.get(folder) ?? new Map<string, string>();
        files.set(basename(file.relativePath), file.absolutePath);
        groups.set(folder, files);
    }
    const seen = new Set<string>();
    return Promise.all(
        [...groups.entries()].map(async ([folder, files]) => {
            if (files.size !== 2 || !files.has("definition.json") || !files.has("page.html")) {
                throw new Error(`Page folder ${folder} must contain exactly definition.json and page.html`);
            }
            const id = basename(folder);
            const definition = (await Bun.file(files.get("definition.json")!).json()) as Record<string, unknown>;
            if (definition.id !== id || Object.hasOwn(definition, "document") || seen.has(id)) {
                throw new Error(`Page folder ${folder} must have a unique matching id and keep its document separate`);
            }
            seen.add(id);
            return {
                ...definition,
                document: { html: (await Bun.file(files.get("page.html")!).text()).trim() },
            };
        }),
    );
}
