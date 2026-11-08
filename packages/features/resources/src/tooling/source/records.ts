import { extname } from "node:path";
import { z } from "zod";
import { sourceJson, sourceText } from "./tree";
import type { ResourcePage, ResourceTextSource } from "resources/artifacts/archive/schemas";

export function sourceTexts(files: ReadonlyMap<string, Uint8Array>): ResourceTextSource["texts"][number][] {
    const definitions = new Map<string, Record<string, unknown>>();
    const locales = new Map<string, Record<string, string>>();
    for (const path of files.keys()) {
        if (path.startsWith("texts/definitions/")) {
            const entries = z.array(z.record(z.string(), z.unknown())).parse(sourceJson(files, path));
            for (const definition of entries) {
                if (
                    typeof definition.id !== "string" ||
                    definitions.has(definition.id) ||
                    Object.hasOwn(definition, "values")
                ) {
                    throw new TypeError("Invalid or duplicate source text definition");
                }
                definitions.set(definition.id, definition);
            }
        } else if (path.startsWith("texts/locales/")) {
            const locale = path.split("/")[2]!;
            const target = locales.get(locale) ?? {};
            for (const [id, value] of Object.entries(z.record(z.string(), z.string()).parse(sourceJson(files, path)))) {
                if (Object.hasOwn(target, id)) {
                    throw new TypeError("Duplicate source text value");
                }
                target[id] = value;
            }
            locales.set(locale, target);
        }
    }
    for (const values of locales.values()) {
        for (const id of Object.keys(values)) {
            if (!definitions.has(id)) {
                throw new TypeError("Unknown source text: " + id);
            }
        }
    }
    return [...definitions].map(([id, definition]) => ({
        ...definition,
        values: Object.fromEntries(
            [...locales]
                .filter(([, values]) => Object.hasOwn(values, id))
                .map(([locale, values]) => [locale, values[id]!]),
        ),
    })) as ResourceTextSource["texts"][number][];
}
export function sourcePages(files: ReadonlyMap<string, Uint8Array>): ResourcePage[] {
    const pages: ResourcePage[] = [];
    const roots = new Map<string, Set<string>>();
    for (const path of files.keys()) {
        if (!path.startsWith("pages/")) {
            continue;
        }
        const index = path.lastIndexOf("/");
        const folder = path.slice(0, index + 1);
        const names = roots.get(folder) ?? new Set();
        names.add(path.slice(index + 1));
        roots.set(folder, names);
    }
    for (const [root, names] of roots) {
        if (names.size !== 2 || !names.has("definition.json") || !names.has("document.html")) {
            throw new TypeError("Page sources require exactly definition.json and document.html");
        }
        const definition = sourceJson(files, root + "definition.json");
        if (
            !definition ||
            typeof definition !== "object" ||
            Array.isArray(definition) ||
            Object.hasOwn(definition, "html")
        ) {
            throw new TypeError("Page HTML must be separate from metadata");
        }
        pages.push({ ...definition, html: sourceText(files.get(root + "document.html")!) } as ResourcePage);
    }
    return pages;
}
const media = new Map([
    [".avif", "image/avif"],
    [".bmp", "image/bmp"],
    [".gif", "image/gif"],
    [".ico", "image/x-icon"],
    [".jpeg", "image/jpeg"],
    [".jpg", "image/jpeg"],
    [".json", "application/json"],
    [".mp3", "audio/mpeg"],
    [".mp4", "video/mp4"],
    [".ogg", "audio/ogg"],
    [".otf", "font/otf"],
    [".pdf", "application/pdf"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".txt", "text/plain"],
    [".ttf", "font/ttf"],
    [".wav", "audio/wav"],
    [".webm", "video/webm"],
    [".webp", "image/webp"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
    [".zip", "application/zip"],
]);
export function mediaTypeFor(id: string): string {
    const value = media.get(extname(id));
    if (!value) {
        throw new TypeError("Unsupported source asset extension: " + id);
    }
    return value;
}
