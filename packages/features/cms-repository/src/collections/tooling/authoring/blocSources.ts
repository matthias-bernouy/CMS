import { stat } from "node:fs/promises";
import { join } from "node:path";
import { buildCollectionBloc } from "cms-repository/collections/tooling/buildCollectionBloc";
import { compileBlocStyle } from "cms-repository/collections/core/validation/blocStyleCompilation";
import { discoverCollectionBlocSources, type BlocSource } from "./blocDiscovery";
import { readSourceEntries, scanFileSourceTree } from "./sourceTree";

/** Discover recursively grouped Bloc folders and compile them without path-derived identity. */
export async function loadCollectionBlocs(directory: string): Promise<unknown[]> {
    const sources = await discoverCollectionBlocSources(directory);
    const byId = new Map<string, string>();
    for (const source of sources) {
        const previous = byId.get(source.id);
        if (previous) {
            throw new Error(
                `Bloc ${JSON.stringify(source.id)} is declared by both ${previous} and ${source.relativePath}`,
            );
        }
        byId.set(source.id, source.relativePath);
    }
    const blocs = [];
    for (const source of sources.sort((left, right) => left.id.localeCompare(right.id))) {
        blocs.push(await compileBlocSource(source));
    }
    return blocs;
}

async function compileBlocSource(source: BlocSource): Promise<unknown> {
    const { definition, id, root } = source;
    if (["markup", "style", "runtime", "defaultContent"].some((key) => Object.hasOwn(definition, key))) {
        throw new Error(`Bloc ${id} must keep markup, CSS and JavaScript in separate files`);
    }
    const markupFile = Bun.file(join(root, "markup.html"));
    const style = Bun.file(join(root, "style.css"));
    const script = Bun.file(join(root, "bloc.ts"));
    const settingsRoot = join(root, "settings");
    const runtimeRoot = join(root, "runtime");
    const settingsFile = Bun.file(join(settingsRoot, "definition.json"));
    const hasSettingsDirectory = await directoryExists(settingsRoot);
    const runtimeSources = await loadRuntimeSources(runtimeRoot, id);
    if (hasSettingsDirectory) {
        const entries = await readSourceEntries(settingsRoot);
        if (entries.length !== 1 || entries[0]!.name !== "definition.json" || !entries[0]!.isFile()) {
            throw new Error(`Bloc ${id} settings must contain only definition.json`);
        }
    }
    if (hasSettingsDirectory && Object.hasOwn(definition, "settings")) {
        throw new Error(`Bloc ${id} must declare settings in only one place`);
    }
    if (!(await markupFile.exists())) {
        throw new Error(`Bloc ${id} requires markup.html`);
    }
    const markup = (await markupFile.text()).trim();
    if (definition.kind === "composition") {
        if (
            (await style.exists()) ||
            (await script.exists()) ||
            Object.keys(runtimeSources).length > 0 ||
            hasSettingsDirectory
        ) {
            throw new Error(`Composition ${id} must have only markup.html`);
        }
        return { ...definition, markup };
    }
    if (definition.kind !== "component") {
        throw new Error(`Bloc ${id} kind must be component or composition`);
    }
    const css = (await style.exists()) ? (await style.text()).trim() : undefined;
    compileBlocStyle(id, css ?? "");
    const compiled = (await script.exists())
        ? await buildCollectionBloc({
              tag: id,
              viewSource: await script.text(),
              source: {
                  ...runtimeSources,
              },
              viewPath: "bloc.ts",
              uses: Array.isArray(definition.uses) ? (definition.uses as string[]) : [],
          })
        : undefined;
    return {
        ...definition,
        ...(hasSettingsDirectory ? { settings: await settingsFile.json() } : {}),
        markup,
        ...(css ? { style: css } : {}),
        ...(compiled ? { runtime: { browserAbi: compiled.browserAbi, viewJS: compiled.viewJS } } : {}),
    };
}

async function loadRuntimeSources(root: string, blocId: string): Promise<Record<string, string>> {
    const files = await scanFileSourceTree(root);
    const sources: Record<string, string> = {};
    for (const file of files) {
        if (!file.relativePath.endsWith(".ts")) {
            throw new Error(`Bloc ${blocId} runtime may contain only TypeScript files: ${file.relativePath}`);
        }
        sources[`runtime/${file.relativePath}`] = Buffer.from(await Bun.file(file.absolutePath).bytes()).toString(
            "base64",
        );
    }
    return sources;
}

async function directoryExists(directory: string): Promise<boolean> {
    try {
        return (await stat(directory)).isDirectory();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }
        throw error;
    }
}
