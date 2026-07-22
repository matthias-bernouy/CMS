import { parseDefinitionDirective } from "./directives";
import { displayPath, resolveJsonFile } from "./paths";
import { appendPointer, arrayItemNode, mergeNode } from "./provenance";
import { withJsonFile } from "./loader";
import type { DefinitionBundleState, DefinitionSource, ResolvedDefinitionFile } from "./types";

export async function resolveDefinitionFileGraph(
    file: string,
    state: DefinitionBundleState,
    depth: number,
): Promise<ResolvedDefinitionFile> {
    return await withJsonFile(file, state, depth, async (value) => await resolveValue(value, file, "", state, depth));
}

export async function resolveValue(
    value: unknown,
    file: string,
    sourcePointer: string,
    state: DefinitionBundleState,
    depth: number,
): Promise<ResolvedDefinitionFile> {
    if (Array.isArray(value)) {
        return await resolveArray(value, file, sourcePointer, state, depth);
    }
    if (!isRecord(value)) {
        return leaf(value, file, sourcePointer);
    }
    const source = `${displayPath(state.versionRoot, file)}#${sourcePointer}`;
    const directive = parseDefinitionDirective(value, source);
    if (directive?.kind === "include") {
        const included = await resolveJsonFile(state.versionRoot, file, directive.path);
        return await resolveDefinitionFileGraph(included, state, depth + 1);
    }
    if (directive?.kind === "files") {
        return await resolveFiles(directive.paths, file, sourcePointer, state, depth);
    }
    return await resolveObject(value, file, sourcePointer, state, depth);
}

async function resolveArray(
    value: unknown[],
    file: string,
    sourcePointer: string,
    state: DefinitionBundleState,
    depth: number,
): Promise<ResolvedDefinitionFile> {
    const resolved: unknown[] = [];
    const provenance = rootProvenance(file, sourcePointer);
    for (const [index, item] of value.entries()) {
        const child = await resolveValue(item, file, appendPointer(sourcePointer, index), state, depth);
        resolved.push(child.value);
        mergeNode(provenance, child, appendPointer("", index));
    }
    return { value: resolved, provenance };
}

async function resolveObject(
    value: Record<string, unknown>,
    file: string,
    sourcePointer: string,
    state: DefinitionBundleState,
    depth: number,
): Promise<ResolvedDefinitionFile> {
    const resolved: Record<string, unknown> = {};
    const provenance = rootProvenance(file, sourcePointer);
    for (const [key, item] of Object.entries(value)) {
        const child = await resolveValue(item, file, appendPointer(sourcePointer, key), state, depth);
        Object.defineProperty(resolved, key, {
            configurable: true,
            enumerable: true,
            value: child.value,
            writable: true,
        });
        mergeNode(provenance, child, appendPointer("", key));
    }
    return { value: resolved, provenance };
}

async function resolveFiles(
    references: string[],
    file: string,
    sourcePointer: string,
    state: DefinitionBundleState,
    depth: number,
): Promise<ResolvedDefinitionFile> {
    const remainingFiles = state.limits.maxFiles - state.filesRead;
    if (references.length > remainingFiles) {
        throw new Error(`Integration definition bundle exceeds the ${state.limits.maxFiles}-file limit`);
    }
    const files = await resolveUniqueFiles(references, file, state);
    const value: unknown[] = [];
    const provenance = rootProvenance(file, sourcePointer);
    for (const resolvedFile of files) {
        const node = await resolveDefinitionFileGraph(resolvedFile, state, depth + 1);
        const items = Array.isArray(node.value)
            ? node.value.map((_, index) => arrayItemNode(node, index))
            : isRecord(node.value)
              ? [node]
              : null;
        if (!items) {
            throw new Error(
                `${displayPath(state.versionRoot, resolvedFile)}: $files entries must resolve to objects or arrays`,
            );
        }
        for (const item of items) {
            mergeNode(provenance, item, appendPointer("", value.length));
            value.push(item.value);
        }
    }
    return { value, provenance };
}

async function resolveUniqueFiles(references: string[], file: string, state: DefinitionBundleState): Promise<string[]> {
    const resolved: string[] = [];
    const seen = new Set<string>();
    for (const reference of references) {
        const path = await resolveJsonFile(state.versionRoot, file, reference);
        if (seen.has(path)) {
            throw new Error(`${displayPath(state.versionRoot, file)}: duplicate $files entry: ${reference}`);
        }
        seen.add(path);
        resolved.push(path);
    }
    return resolved;
}

function leaf(value: unknown, file: string, pointer: string): ResolvedDefinitionFile {
    return { value, provenance: rootProvenance(file, pointer) };
}

function rootProvenance(file: string, pointer: string): Map<string, DefinitionSource> {
    return new Map([["", { file, pointer }]]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
