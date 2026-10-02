import { stat } from "node:fs/promises";
import { join } from "node:path";
import { buildCollectionBloc } from "@bernouy/cms-collection-build";
import { discoverCollectionBlocSources, type BlocSource } from "./blocDiscovery";
import { readSourceEntries } from "./sourceTree";

const DEFAULT_BLOC_SOURCE = `
import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    constructor() {
        super({ css, template });
    }
}
`;

/** Discover recursively grouped Bloc folders and compile them without path-derived identity. */
export async function loadCollectionBlocs(directory: string, group: string): Promise<unknown[]> {
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
        blocs.push(await compileBlocSource(source, group));
    }
    return blocs;
}

async function compileBlocSource(source: BlocSource, group: string): Promise<unknown> {
    const { definition, id, root } = source;
    if (["shadowdom", "lightdom", "style", "runtime", "defaultContent"].some((key) => Object.hasOwn(definition, key))) {
        throw new Error(`Bloc ${id} must keep markup, CSS and JavaScript in separate files`);
    }
    const shadow = Bun.file(join(root, "shadowdom.html"));
    const light = Bun.file(join(root, "lightdom.html"));
    const style = Bun.file(join(root, "style.css"));
    const defaults = Bun.file(join(root, "default.html"));
    const script = Bun.file(join(root, "bloc.ts"));
    const settingsRoot = join(root, "settings");
    const settingsFile = Bun.file(join(settingsRoot, "definition.json"));
    const hasSettingsDirectory = await directoryExists(settingsRoot);
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
            (await shadow.exists()) ||
            (await style.exists()) ||
            (await script.exists()) ||
            hasSettingsDirectory
        ) {
            throw new Error(`Composition ${id} must have only lightdom.html and optional default.html`);
        }
        return { ...definition, lightdom: (await light.text()).trim(), ...(defaultContent ? { defaultContent } : {}) };
    }
    if (definition.kind !== "component" || !(await shadow.exists())) {
        throw new Error(`Component ${id} requires shadowdom.html`);
    }
    const shadowdom = (await shadow.text()).trim();
    const lightdom = (await light.exists()) ? (await light.text()).trim() : undefined;
    const css = (await style.exists()) ? (await style.text()).trim() : undefined;
    const compiled = await buildCollectionBloc(
        new File([(await script.exists()) ? await script.text() : DEFAULT_BLOC_SOURCE], "bloc.ts", {
            type: "text/typescript",
        }),
        String(definition.label),
        group,
        String(definition.description ?? ""),
        id,
        {
            "shadowdom.html": Buffer.from(shadowdom).toString("base64"),
            "style.css": Buffer.from(css ?? "").toString("base64"),
        },
        defaultContent,
        { viewPath: "bloc.ts" },
    );
    return {
        ...definition,
        ...(hasSettingsDirectory ? { settings: await settingsFile.json() } : {}),
        shadowdom,
        ...(lightdom ? { lightdom } : {}),
        ...(defaultContent ? { defaultContent } : {}),
        ...(css ? { style: css } : {}),
        runtime: { viewJS: compiled.viewJS },
    };
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
