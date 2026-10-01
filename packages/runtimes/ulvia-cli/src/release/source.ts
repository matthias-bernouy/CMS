import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { admitCollectionRelease, isCollectionNamespace } from "@bernouy/cms-repository/collections";
import { buildCollectionBloc } from "@bernouy/cms-collection-build";

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
    if (!isCollectionNamespace(collectionId)) {
        throw new Error("Invalid collection ID");
    }
    const definition = (await Bun.file(join(collectionRoot, "definition.json")).json()) as Record<string, unknown>;
    const blocs = await loadBlocs(join(collectionRoot, "blocs"), String(definition.name ?? collectionId));
    const texts = await readJsonFiles(join(collectionRoot, "texts"), true);
    const views = await loadViews(join(collectionRoot, "views"));
    const dashboards = await loadDashboards(join(collectionRoot, "dashboards"));
    const themeFile = Bun.file(join(collectionRoot, "theme", "definition.json"));
    const assets = await loadAssets(join(collectionRoot, "assets"), definition.assets);
    const candidate = {
        ...definition,
        assets: assets.definitions,
        blocs,
        ...(texts.length ? { texts } : {}),
        ...(views.length ? { views } : {}),
        ...(dashboards.length ? { dashboards } : {}),
        ...((await themeFile.exists()) ? { theme: await themeFile.json() } : {}),
    };
    const artifact = await admitCollectionRelease(candidate, assets.bundle);
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
        if (Object.keys(source).some((key) => !["id", "mediaType"].includes(key))) {
            throw new Error(`Collection source asset ${index} accepts only id and mediaType`);
        }
        if (
            typeof source.id !== "string" ||
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
        const compiled = await buildCollectionBloc(
            new File([(await source.exists()) ? await source.text() : DEFAULT_BLOC_SOURCE], "bloc.ts", {
                type: "text/typescript",
            }),
            String(definition.label),
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
            runtime: { viewJS: compiled.viewJS },
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
