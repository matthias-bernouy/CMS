import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";

const DEFAULT_COLLECTIONS = resolve(import.meta.dir, "../../../../resources/collections");
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

/** Serve declarative collection folders from the workspace on loopback. */
export async function startLocalRepository(port: number, root = DEFAULT_COLLECTIONS) {
    const releases = await loadCollections(root);
    const entries = releases.map(({ artifact }) => ({
        publisherId: artifact.release.publisherId,
        collectionId: artifact.release.collectionId,
        version: artifact.release.version,
        digest: artifact.digest,
        name: artifact.release.name,
        description: artifact.release.description ?? "",
        blocCount: artifact.release.blocs.length,
        hasTheme: Boolean(artifact.release.theme),
    }));
    const routes = new Map(
        releases.map(({ artifact }) => [
            `/v1/collections/${artifact.release.publisherId}/${artifact.release.collectionId}/${artifact.release.version}`,
            artifact,
        ]),
    );
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        fetch(request) {
            const url = new URL(request.url);
            if (request.method !== "GET") {
                return new Response(null, { status: 405 });
            }
            if (url.pathname === "/v1/collections") {
                return Response.json({ releases: entries }, { headers: { "Cache-Control": "no-store" } });
            }
            const artifact = routes.get(url.pathname);
            if (!artifact) {
                return new Response(null, { status: 404 });
            }
            return new Response(artifact.canonicalJson, {
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    ETag: `"${artifact.digest}"`,
                    "Cache-Control": "public, max-age=31536000, immutable",
                },
            });
        },
    });
    return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

async function loadCollections(root: string) {
    const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    const releases = [];
    for (const directory of directories.sort((a, b) => a.name.localeCompare(b.name))) {
        const collectionRoot = join(root, directory.name);
        const definitionFile = Bun.file(join(collectionRoot, "definition.json"));
        if (!(await definitionFile.exists())) {
            continue;
        }
        const definition = (await definitionFile.json()) as Record<string, unknown>;
        const blocs = await loadBlocs(join(collectionRoot, "blocs"), String(definition.name ?? directory.name));
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
        if (artifact.release.collectionId !== directory.name) {
            throw new Error(`Collection folder ${directory.name} does not match its definition`);
        }
        releases.push({ artifact });
    }
    return releases;
}

async function loadBlocs(directory: string, group: string): Promise<unknown[]> {
    const folders = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory());
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
    const files = (await readdir(directory, { withFileTypes: true })).filter(
        (entry) => entry.isFile() && entry.name.endsWith(".json"),
    );
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
