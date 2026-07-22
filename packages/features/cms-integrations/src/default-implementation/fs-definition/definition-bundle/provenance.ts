import { relative, sep } from "node:path";
import type { DefinitionSource, ResolvedDefinitionFile } from "./types";

export function appendPointer(pointer: string, part: string | number): string {
    return `${pointer}/${String(part).replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

export function sourceNode(value: unknown, file: string, pointer = ""): ResolvedDefinitionFile {
    const provenance = new Map<string, DefinitionSource>();
    collectSource(value, file, pointer, "", provenance);
    return { value, provenance };
}

export function mergeNode(
    target: Map<string, DefinitionSource>,
    node: ResolvedDefinitionFile,
    outputPointer: string,
): void {
    for (const [pointer, source] of node.provenance) {
        target.set(`${outputPointer}${pointer}`, source);
    }
}

export function arrayItemNode(node: ResolvedDefinitionFile, index: number): ResolvedDefinitionFile {
    if (!Array.isArray(node.value)) {
        throw new Error("Expected a resolved definition array");
    }
    const prefix = `/${index}`;
    const provenance = new Map<string, DefinitionSource>();
    for (const [pointer, source] of node.provenance) {
        if (pointer === prefix) {
            provenance.set("", source);
        } else if (pointer.startsWith(`${prefix}/`)) {
            provenance.set(pointer.slice(prefix.length), source);
        }
    }
    return { value: node.value[index], provenance };
}

export function enrichDefinitionError(
    error: unknown,
    provenance: Map<string, DefinitionSource>,
    versionRoot: string,
): unknown {
    if (!(error instanceof Error)) {
        return error;
    }
    const field = error.message.match(/\bdefinition(?:\.[A-Za-z0-9_-]+)*/)?.[0];
    if (!field) {
        return error;
    }
    const pointer = field === "definition" ? "" : fieldToPointer(field.slice("definition.".length));
    const located = nearestSource(pointer, provenance);
    if (!located) {
        return error;
    }
    const file = relative(versionRoot, located.source.file).split(sep).join("/");
    error.message = `${error.message}\nSource: ${field} -> ${file}#${located.pointer}`;
    return error;
}

function collectSource(
    value: unknown,
    file: string,
    sourcePointer: string,
    outputPointer: string,
    provenance: Map<string, DefinitionSource>,
): void {
    provenance.set(outputPointer, { file, pointer: sourcePointer });
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            collectSource(
                item,
                file,
                appendPointer(sourcePointer, index),
                appendPointer(outputPointer, index),
                provenance,
            ),
        );
    } else if (isRecord(value)) {
        for (const [key, child] of Object.entries(value)) {
            collectSource(
                child,
                file,
                appendPointer(sourcePointer, key),
                appendPointer(outputPointer, key),
                provenance,
            );
        }
    }
}

function fieldToPointer(field: string): string {
    return field.split(".").reduce((pointer, part) => appendPointer(pointer, part), "");
}

function nearestSource(
    pointer: string,
    provenance: Map<string, DefinitionSource>,
): { pointer: string; source: DefinitionSource } | null {
    let candidate = pointer;
    while (true) {
        const source = provenance.get(candidate);
        if (source) {
            return { pointer: `${source.pointer}${pointer.slice(candidate.length)}`, source };
        }
        const boundary = candidate.lastIndexOf("/");
        if (boundary < 0) {
            return null;
        }
        candidate = candidate.slice(0, boundary);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
