import { resourceName } from "cms-repository/exports/contracts/protocol";
import { materializeStateSchemas } from "./stateSchemas";
import { basename, join, resolve } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { loadCollectionExamples } from "../examples/source";
import { loadCollectionBlocs } from "./blocSources";
import { expandCollectionSourceExports, loadCollectionTheme, loadCollectionTranslations } from "./metadataSources";
import { loadCollectionTexts } from "./textSources";
import { readSourceEntries } from "cms-repository/repository/authoring/sourceTree";
import { loadCollectionAssets } from "./assetSources";
import { collectionAuthoringDiagnostics } from "./exampleDiagnostics";

/** Compile one authored folder into an immutable, admitted release candidate. */
export async function prepareCollectionRelease(directory: string, contracts?: ReleaseCatalogue) {
    const collectionRoot = resolve(directory);
    const collectionId = basename(collectionRoot);
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(collectionId)) {
        throw new Error("Invalid collection ID");
    }
    const definition = (await Bun.file(join(collectionRoot, "definition.json")).json()) as Record<string, unknown>;
    const directories = new Set(["blocs", "translations", "assets", "texts", "theme", "examples"]);
    for (const entry of await readSourceEntries(collectionRoot)) {
        if (entry.isDirectory() && !directories.has(entry.name)) {
            throw new Error(`Unknown collection source directory: ${entry.name}`);
        }
    }
    const translations = await loadCollectionTranslations(join(collectionRoot, "translations"));
    const blocs = await loadCollectionBlocs(join(collectionRoot, "blocs"));
    const examples = await loadCollectionExamples(join(collectionRoot, "examples"));
    if (examples.length && definition.protocol !== "ulvia-collection/v1") {
        throw new Error("Example sources require collection v1");
    }
    const texts = await loadCollectionTexts(join(collectionRoot, "texts"));
    const theme = await loadCollectionTheme(join(collectionRoot, "theme"));
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
    });
    const candidate = {
        ...definition,
        ...(definition.states === undefined
            ? {}
            : { states: await materializeStateSchemas(definition.states, contracts) }),
        ...(exports === undefined ? {} : { exports }),
        translations,
        assets: assets.definitions,
        blocs,
        examples,
        ...(texts.length ? { texts } : {}),
        ...(theme === undefined ? {} : { theme }),
    };
    const artifact = await admitCollectionRelease(candidate, assets.bundle, { contracts });
    if (resourceName(artifact.release.collectionId) !== collectionId) {
        throw new Error(`Collection folder ${collectionId} does not match its definition`);
    }
    const diagnostics = collectionAuthoringDiagnostics(artifact.release);
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        throw new CollectionAuthoringValidationError(diagnostics);
    }
    return Object.freeze({ ...artifact, diagnostics });
}

export class CollectionAuthoringValidationError extends Error {
    constructor(readonly diagnostics: ReturnType<typeof collectionAuthoringDiagnostics>) {
        super(
            diagnostics.find((diagnostic) => diagnostic.severity === "error")?.message ?? "Invalid collection examples",
        );
    }
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
