import { posix } from "node:path";
import {
    decodeIntegrationPackageFile,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageLimits,
} from "@bernouy/cms-integration-packages";

const DEFINITION_SCHEMAS = new Set(["cms.integration.definition.v1", "cms.integration.definition.v2"]);
const DEFINITION_BUNDLE_SCHEMA = "cms.integration.definition.bundle.v1";
const MAX_DEFINITION_BUNDLE_DEPTH = 32;
const MAX_DEFINITION_BUNDLE_FILES = 4_096;
const MAX_DEFINITION_BUNDLE_BYTES = 16 * 1_024 * 1_024;
const utf8 = new TextDecoder("utf-8", { fatal: true });

type BundleState = {
    activeFiles: string[];
    bytesRead: number;
    filesRead: number;
    envelope: IntegrationPackageEnvelopeV1;
    limits: Readonly<IntegrationPackageLimits>;
};

export function resolveIntegrationDefinitionEnvelopeValue(
    envelope: IntegrationPackageEnvelopeV1,
    limits: Readonly<IntegrationPackageLimits>,
): unknown {
    if (posix.extname(envelope.definition).toLowerCase() !== ".json") {
        throw new Error(`${envelope.definition}: integration definition must have a .json extension`);
    }
    const state: BundleState = { activeFiles: [], bytesRead: 0, filesRead: 0, envelope, limits };
    return withJson(envelope.definition, state, 0, (entry) => {
        if (!isBundleEntry(entry)) {
            return resolveValue(entry, envelope.definition, state, 0);
        }
        if (Object.keys(entry).length !== 2 || typeof entry.root !== "string" || !entry.root.trim()) {
            throw new Error(`${envelope.definition}: definition bundle must contain only schema and a root JSON path`);
        }
        const root = resolveJsonReference(envelope.definition, entry.root, state);
        const value = resolveJsonGraph(root, state, 1);
        if (!isRecord(value) || !DEFINITION_SCHEMAS.has(String(value.schema))) {
            throw new Error(`${root}: bundle root must use a supported integration definition schema`);
        }
        return value;
    });
}

function resolveJsonGraph(path: string, state: BundleState, depth: number): unknown {
    return withJson(path, state, depth, (value) => resolveValue(value, path, state, depth));
}

function resolveValue(value: unknown, file: string, state: BundleState, depth: number): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => resolveValue(item, file, state, depth));
    }
    if (!isRecord(value)) {
        return value;
    }
    const directive = parseDirective(value, file);
    if (directive?.kind === "include") {
        return resolveJsonGraph(resolveJsonReference(file, directive.path, state), state, depth + 1);
    }
    if (directive?.kind === "files") {
        return resolveFiles(directive.paths, file, state, depth);
    }
    const resolved: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
        Object.defineProperty(resolved, key, {
            configurable: true,
            enumerable: true,
            value: resolveValue(child, file, state, depth),
            writable: true,
        });
    }
    return resolved;
}

function resolveFiles(references: string[], file: string, state: BundleState, depth: number): unknown[] {
    const maxFiles = definitionBundleFileLimit(state);
    if (references.length > maxFiles - state.filesRead) {
        throw new Error(`Integration definition bundle exceeds the ${maxFiles}-file limit`);
    }
    const resolvedPaths = references.map((reference) => resolveJsonReference(file, reference, state));
    if (new Set(resolvedPaths).size !== resolvedPaths.length) {
        throw new Error(`${file}: duplicate $files entry`);
    }
    const output: unknown[] = [];
    for (const path of resolvedPaths) {
        const value = resolveJsonGraph(path, state, depth + 1);
        if (Array.isArray(value)) {
            output.push(...value);
        } else if (isRecord(value)) {
            output.push(value);
        } else {
            throw new Error(`${path}: $files entries must resolve to objects or arrays`);
        }
    }
    return output;
}

function withJson<T>(path: string, state: BundleState, depth: number, consume: (value: unknown) => T): T {
    if (depth > Math.min(MAX_DEFINITION_BUNDLE_DEPTH, state.limits.maxDepth)) {
        throw new Error("Integration definition bundle exceeds its inclusion depth limit");
    }
    if (state.activeFiles.includes(path)) {
        throw new Error(`Cyclic integration definition inclusion: ${[...state.activeFiles, path].join(" -> ")}`);
    }
    const file = state.envelope.files[path];
    if (!file) {
        throw new Error(`Referenced integration definition JSON file was not found: ${path}`);
    }
    state.filesRead += 1;
    const maxFiles = definitionBundleFileLimit(state);
    if (state.filesRead > maxFiles) {
        throw new Error(`Integration definition bundle exceeds the ${maxFiles}-file limit`);
    }
    const bytes = decodeIntegrationPackageFile(file);
    state.bytesRead += bytes.byteLength;
    const maxBytes = Math.min(MAX_DEFINITION_BUNDLE_BYTES, state.limits.maxDecodedBytes);
    if (state.bytesRead > maxBytes) {
        throw new Error(`Integration definition bundle exceeds the ${maxBytes}-byte limit`);
    }
    state.activeFiles.push(path);
    try {
        let value: unknown;
        try {
            value = JSON.parse(utf8.decode(bytes));
        } catch (error) {
            throw new Error(`${path}: invalid JSON: ${errorMessage(error)}`);
        }
        return consume(value);
    } finally {
        state.activeFiles.pop();
    }
}

function definitionBundleFileLimit(state: BundleState): number {
    return Math.min(MAX_DEFINITION_BUNDLE_FILES, state.limits.maxFiles);
}

function resolveJsonReference(file: string, reference: string, state: BundleState): string {
    if (
        !reference.trim() ||
        reference.includes("\\") ||
        reference.startsWith("/") ||
        /^[a-zA-Z]:\//u.test(reference) ||
        posix.extname(reference).toLowerCase() !== ".json"
    ) {
        throw new Error(`${file}: referenced JSON path must be a safe relative .json file: ${reference}`);
    }
    const path = posix.normalize(posix.join(posix.dirname(file), reference));
    if (path === ".." || path.startsWith("../") || !state.envelope.files[path]) {
        throw new Error(`${file}: referenced JSON file not found: ${reference}`);
    }
    return path;
}

type DefinitionDirective = { kind: "include"; path: string } | { kind: "files"; paths: string[] };

function parseDirective(value: Record<string, unknown>, source: string): DefinitionDirective | null {
    const hasInclude = Object.hasOwn(value, "$include");
    const hasFiles = Object.hasOwn(value, "$files");
    if (!hasInclude && !hasFiles) {
        return null;
    }
    if (Object.keys(value).length !== 1 || hasInclude === hasFiles) {
        throw new Error(`${source}: a definition directive must contain exactly one of $include or $files`);
    }
    if (hasInclude) {
        if (typeof value.$include !== "string" || !value.$include.trim()) {
            throw new Error(`${source}: $include must be a non-empty JSON path`);
        }
        return { kind: "include", path: value.$include };
    }
    if (!Array.isArray(value.$files) || value.$files.some((path) => typeof path !== "string" || !path.trim())) {
        throw new Error(`${source}: $files must be an array of non-empty JSON paths`);
    }
    return { kind: "files", paths: value.$files as string[] };
}

function isBundleEntry(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && value.schema === DEFINITION_BUNDLE_SCHEMA;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
