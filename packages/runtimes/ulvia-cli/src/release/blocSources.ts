import { stat } from "node:fs/promises";
import { join } from "node:path";
import { buildCollectionBloc, compileBlocStyle, compileBlocTemplate } from "@bernouy/cms-repository/collections/build";
import { discoverCollectionBlocSources, type BlocSource } from "./blocDiscovery";
import { readSourceEntries, scanFileSourceTree } from "./authored/sourceTree";

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
    if (["template", "lightdom", "style", "runtime", "defaultContent"].some((key) => Object.hasOwn(definition, key))) {
        throw new Error(`Bloc ${id} must keep markup, CSS and JavaScript in separate files`);
    }
    const templateFile = Bun.file(join(root, "template.html"));
    const light = Bun.file(join(root, "lightdom.html"));
    const style = Bun.file(join(root, "style.css"));
    const defaults = Bun.file(join(root, "default.html"));
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
    const defaultContent = (await defaults.exists()) ? (await defaults.text()).trim() : undefined;
    if (definition.kind === "composition") {
        if (
            !(await light.exists()) ||
            (await templateFile.exists()) ||
            (await style.exists()) ||
            (await script.exists()) ||
            Object.keys(runtimeSources).length > 0 ||
            hasSettingsDirectory
        ) {
            throw new Error(`Composition ${id} must have only lightdom.html and optional default.html`);
        }
        return { ...definition, lightdom: (await light.text()).trim(), ...(defaultContent ? { defaultContent } : {}) };
    }
    if (definition.kind !== "component" || !(await templateFile.exists())) {
        throw new Error(`Component ${id} requires template.html`);
    }
    const shell = (await templateFile.text()).trim();
    const lightdom = (await light.exists()) ? (await light.text()).trim() : undefined;
    const css = (await style.exists()) ? (await style.text()).trim() : undefined;
    const template = compileBlocTemplate(shell, lightdom);
    const scopedStyle = compileBlocStyle(id, css ?? "");
    const compiled = await buildCollectionBloc({
        tag: id,
        ...((await script.exists()) ? { viewSource: await script.text() } : {}),
        style: scopedStyle,
        source: {
            ...runtimeSources,
        },
        viewPath: "bloc.ts",
        uses: Array.isArray(definition.uses) ? (definition.uses as string[]) : [],
    });
    return {
        ...definition,
        ...(hasSettingsDirectory ? { settings: await settingsFile.json() } : {}),
        template,
        ...(defaultContent ? { defaultContent } : {}),
        ...(css ? { style: css } : {}),
        runtime: { viewJS: compiled.viewJS },
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
