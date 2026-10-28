import { createExampleContext } from "./context";
import { collectionExampleDocument } from "../../core/validation/examples/document";
import { parseHTML } from "linkedom";
import { renderPageDocument } from "@bernouy/cms-content/rendering";
import { loadBindingCoreRuntimeEntry, loadBlocRuntimeEntry } from "@bernouy/cms-content/runtime-assets";
import { generateThemeCss, defaultThemeSettings } from "@bernouy/cms-content";
import { parseCollectionAssetReference } from "@bernouy/cms-content/page-document";
import type { AdmittedCollectionRelease } from "../../interfaces/CollectionAdmission";
import { collectionThemeSource } from "../../integration/content/theme";
import { projectCollectionTextSource } from "../../integration/content/texts";
import { resolveCollectionTranslation } from "../../core/texts/translationCatalogue";

export type CollectionExampleFrame = {
    path: string;
    exampleId: string;
    previewId: string;
    label: string;
    description: string;
    width: number;
    height: number;
    locale: string;
    themeMode: "light" | "dark";
};

export type CollectionExampleRenderOptions = { locale?: string; themeMode?: "light" | "dark" };

export type CollectionExampleRuntimes = { blocRuntime: string; bindingCore: string };

export type CollectionExampleExport = {
    files: ReadonlyMap<string, Blob>;
    frames: readonly CollectionExampleFrame[];
};

/** Uses the normal document renderer; callers own browser execution and output persistence. */
export async function renderCollectionExamples(
    artifact: AdmittedCollectionRelease,
    dependencies: readonly AdmittedCollectionRelease[] = [],
    runtimes?: CollectionExampleRuntimes,
    options: CollectionExampleRenderOptions = {},
): Promise<CollectionExampleExport> {
    let locale: string;
    try {
        locale = Intl.getCanonicalLocales(options.locale ?? artifact.release.locale)[0]!;
    } catch {
        throw new TypeError("Invalid example rendering locale");
    }
    const themeMode = options.themeMode ?? "light";
    if (!locale || (themeMode !== "light" && themeMode !== "dark")) {
        throw new TypeError("Invalid example rendering context");
    }
    const { releases, files, assets, byId, renderable, resolveAssets } = createExampleContext(artifact, dependencies);
    const runtimeAssets = runtimes ?? {
        blocRuntime: new TextDecoder().decode((await loadBlocRuntimeEntry()).raw),
        bindingCore: new TextDecoder().decode((await loadBindingCoreRuntimeEntry()).raw),
    };
    files.set("bloc-runtime.js", new Blob([runtimeAssets.blocRuntime], { type: "text/javascript" }));
    files.set("binding-core.js", new Blob([runtimeAssets.bindingCore], { type: "text/javascript" }));
    const frames: CollectionExampleFrame[] = [];
    for (const example of artifact.release.examples ?? []) {
        for (const preview of example.previews) {
            const { document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
            const rendered = await renderPageDocument(
                document.body,
                collectionExampleDocument(artifact.release, example.id, releases),
                {
                    repository: {
                        getRenderableBlocs: async () => renderable,
                        getBlocViewJS: async (id) => {
                            const bloc = byId.get(id);
                            return bloc?.kind === "component" ? (bloc.runtime?.viewJS ?? null) : null;
                        },
                        getContentTexts: async () =>
                            releases.map((collection) => projectCollectionTextSource({ collection })),
                    },
                    language: locale,
                    resolveContributedAssets: resolveAssets,
                    resolveSvgSources: async (sources) =>
                        new Map(
                            await Promise.all(
                                sources.map(async (source) => {
                                    const reference = parseCollectionAssetReference(source);
                                    const bytes = reference
                                        ? assets.get(`${reference.collectionId}/${reference.assetId}`)
                                        : undefined;
                                    if (!bytes) {
                                        throw new Error(`Unknown SVG example asset: ${source}`);
                                    }
                                    return [source, new Uint8Array(await bytes.arrayBuffer())] as const;
                                }),
                            ),
                        ),
                },
            );
            document.documentElement.lang = locale;
            document.documentElement.setAttribute("data-theme-mode", themeMode);
            const sources = releases
                .map((release) => collectionThemeSource(release, locale))
                .filter((source) => source !== null);
            const theme = defaultThemeSettings();
            theme.sources = sources;
            const selected = Object.fromEntries(
                sources.flatMap((source) =>
                    source.categories.flatMap((category) =>
                        category.tokens.flatMap((token) => {
                            const value = token.defaults?.[themeMode] ?? token.defaults?.light;
                            return value === undefined ? [] : [[token.id, value]];
                        }),
                    ),
                ),
            );
            theme.themes = [{ id: "example", name: "Example", values: { light: selected, dark: selected } }];
            theme.activeThemeId = "example";
            const themeCss = generateThemeCss(theme);
            const path = `${example.id}--${preview.id}`;
            const css = [
                "*,*::before,*::after{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}",
                themeCss,
                ...rendered.renderableBlocs
                    .filter((bloc) => rendered.usedTags.includes(bloc.id))
                    .map((bloc) => bloc.styleCSS ?? ""),
            ].join("\n");
            files.set(`${path}.css`, new Blob([await resolveAssets(css)], { type: "text/css" }));
            for (const name of ["viewport", "color-scheme"]) {
                const meta = document.createElement("meta");
                meta.name = name;
                meta.content = name === "viewport" ? "width=device-width, initial-scale=1" : themeMode;
                document.head.append(meta);
            }
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = `${path}.css`;
            document.head.append(link);
            const scripts = ["bloc-runtime.js", ...(rendered.requiresBindingRuntime ? ["binding-core.js"] : [])];
            for (const id of rendered.usedTags) {
                const bloc = byId.get(id);
                if (bloc?.kind === "component" && bloc.runtime?.viewJS) {
                    files.set(`blocs/${id}.js`, new Blob([bloc.runtime.viewJS], { type: "text/javascript" }));
                    scripts.push(`blocs/${id}.js`);
                }
            }
            for (const src of scripts) {
                const script = document.createElement("script");
                script.src = src;
                script.defer = true;
                document.head.append(script);
            }
            files.set(`${path}.html`, new Blob([document.toString()], { type: "text/html" }));
            frames.push({
                path: `${path}.html`,
                exampleId: example.id,
                previewId: preview.id,
                label: resolveCollectionTranslation(artifact.release, example.label, locale),
                description: resolveCollectionTranslation(artifact.release, example.description, locale),
                width: preview.frame.width,
                height: preview.frame.height,
                locale: locale,
                themeMode: themeMode,
            });
        }
    }
    return { files, frames };
}
