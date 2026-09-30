import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";

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

/** Compile one authored folder into an immutable, admitted release candidate. */
export async function prepareCollectionRelease(directory: string) {
    const collectionRoot = resolve(directory);
    const collectionId = basename(collectionRoot);
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(collectionId)) {
        throw new Error("Invalid collection ID");
    }
    const definition = (await Bun.file(join(collectionRoot, "definition.json")).json()) as Record<string, unknown>;
    const blocs = await loadBlocs(join(collectionRoot, "blocs"), String(definition.name ?? collectionId));
    const texts = await readJsonFiles(join(collectionRoot, "texts"), true);
    const themeFile = Bun.file(join(collectionRoot, "theme", "definition.json"));
    const candidate = {
        ...definition,
        assets: [],
        blocs,
        ...(texts.length ? { texts } : {}),
        ...((await themeFile.exists()) ? { theme: await themeFile.json() } : {}),
    };
    const artifact = await admitCollectionRelease(candidate);
    if (artifact.release.collectionId !== collectionId) {
        throw new Error(`Collection folder ${collectionId} does not match its definition`);
    }
    return artifact;
}

async function loadBlocs(directory: string, group: string): Promise<unknown[]> {
    const folders = (await readEntries(directory)).filter((entry) => entry.isDirectory());
    const blocs: unknown[] = [];
    for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
        const root = join(directory, folder.name);
        const definition = (await Bun.file(join(root, "definition.json")).json()) as Record<string, unknown>;
        if (definition.id !== folder.name) {
            throw new Error(`Bloc folder ${folder.name} does not match its definition`);
        }
        if (
            ["shadowdom", "lightdom", "style", "runtime", "defaultContent"].some((key) =>
                Object.hasOwn(definition, key),
            )
        ) {
            throw new Error(`Bloc ${folder.name} must keep markup, CSS and JavaScript in separate files`);
        }
        const shadow = Bun.file(join(root, "shadowdom.html"));
        const light = Bun.file(join(root, "lightdom.html"));
        const style = Bun.file(join(root, "style.css"));
        const defaults = Bun.file(join(root, "default.html"));
        const source = Bun.file(join(root, "bloc.ts"));
        const settingsFile = Bun.file(join(root, "settings", "definition.json"));
        const hasSettingsFile = await settingsFile.exists();
        if (hasSettingsFile && Object.hasOwn(definition, "settings")) {
            throw new Error(`Bloc ${folder.name} must declare settings in only one place`);
        }
        const defaultContent = (await defaults.exists()) ? (await defaults.text()).trim() : undefined;
        if (definition.kind === "composition") {
            if (
                !(await light.exists()) ||
                (await shadow.exists()) ||
                (await style.exists()) ||
                (await source.exists()) ||
                hasSettingsFile
            ) {
                throw new Error(`Composition ${folder.name} must have only lightdom.html`);
            }
            blocs.push({
                ...definition,
                lightdom: (await light.text()).trim(),
                ...(defaultContent ? { defaultContent } : {}),
            });
            continue;
        }
        if (definition.kind !== "component" || !(await shadow.exists())) {
            throw new Error(`Component ${folder.name} requires shadowdom.html`);
        }
        const shadowdom = (await shadow.text()).trim();
        const lightdom = (await light.exists()) ? (await light.text()).trim() : undefined;
        const css = (await style.exists()) ? (await style.text()).trim() : undefined;
        const inputs = {
            "shadowdom.html": Buffer.from(shadowdom).toString("base64"),
            "style.css": Buffer.from(css ?? "").toString("base64"),
        };
        const compiled = await prepare_bloc(
            new File([(await source.exists()) ? await source.text() : DEFAULT_BLOC_SOURCE], "bloc.ts", {
                type: "text/typescript",
            }),
            null,
            folder.name,
            group,
            String(definition.description ?? ""),
            folder.name,
            inputs,
            defaultContent,
            { viewPath: "bloc.ts" },
        );
        blocs.push({
            ...definition,
            ...(hasSettingsFile ? { settings: await settingsFile.json() } : {}),
            shadowdom,
            ...(lightdom ? { lightdom } : {}),
            ...(defaultContent ? { defaultContent } : {}),
            ...(css ? { style: css } : {}),
            runtime: { viewJS: compiled.viewJS, editorJS: compiled.editorJS },
        });
    }
    return blocs;
}

async function readJsonFiles(directory: string, arrays: boolean): Promise<unknown[]> {
    const files = (await readEntries(directory)).filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const values: unknown[] = [];
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
        const value: unknown = await Bun.file(join(directory, file.name)).json();
        if (arrays) {
            if (!Array.isArray(value)) {
                throw new Error(`${file.name} must contain a JSON array`);
            }
            values.push(...value);
        } else {
            values.push(value);
        }
    }
    return values;
}

async function readEntries(directory: string) {
    return readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
}
