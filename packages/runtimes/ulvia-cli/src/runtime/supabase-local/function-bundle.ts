import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { posix } from "node:path";

export type LocalFunctionMetadata = Readonly<{
    entrypoint_path: string;
    import_map_path?: string;
    static_patterns?: string[];
    verify_jwt?: boolean;
    name?: string;
}>;

export type LocalFunctionBundle = Readonly<{
    metadata: LocalFunctionMetadata;
    files: ReadonlyArray<Readonly<{ path: string; bytes: Uint8Array }>>;
    digest: string;
}>;

const MAX_FILES = 1_024;
const MAX_BYTES = 16 * 1_024 * 1_024;

export async function readLocalFunctionBundle(body: FormData): Promise<LocalFunctionBundle> {
    const metadataPart = body.get("metadata");
    if (!(metadataPart instanceof Blob)) {
        throw new TypeError("Function deployment metadata is required");
    }
    const metadata = parseMetadata(await metadataPart.text());
    const fileParts = body.getAll("file");
    if (!fileParts.length || fileParts.length > MAX_FILES || fileParts.some((part) => !(part instanceof File))) {
        throw new TypeError("Function deployment has an invalid file set");
    }
    const files = [];
    let totalBytes = 0;
    for (const part of fileParts as File[]) {
        const path = safeRelativePath(part.name);
        const bytes = new Uint8Array(await part.arrayBuffer());
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_BYTES) {
            throw new TypeError("Function deployment exceeds the local size limit");
        }
        files.push({ path, bytes });
    }
    if (new Set(files.map((file) => file.path)).size !== files.length) {
        throw new TypeError("Function deployment contains duplicate paths");
    }
    const available = new Set(files.map((file) => file.path));
    if (
        !available.has(metadata.entrypoint_path) ||
        (metadata.import_map_path && !available.has(metadata.import_map_path))
    ) {
        throw new TypeError("Function configuration references a missing file");
    }
    return { metadata, files, digest: await bundleDigest(body) };
}

function parseMetadata(source: string): LocalFunctionMetadata {
    const value = JSON.parse(source) as Record<string, unknown>;
    const entrypointPath = safeRelativePath(text(value.entrypoint_path, "entrypoint_path") ?? "index.ts");
    const importMapPath = text(value.import_map_path, "import_map_path");
    const staticPatterns = stringArray(value.static_patterns, "static_patterns")?.map(safePattern);
    const verifyJwt = optionalBoolean(value.verify_jwt, "verify_jwt");
    const name = text(value.name, "name");
    return {
        entrypoint_path: entrypointPath,
        ...(importMapPath ? { import_map_path: safeRelativePath(importMapPath) } : {}),
        ...(staticPatterns ? { static_patterns: staticPatterns } : {}),
        ...(verifyJwt !== undefined ? { verify_jwt: verifyJwt } : {}),
        ...(name ? { name } : {}),
    };
}

function safeRelativePath(value: string): string {
    const normalized = value.replaceAll("\\", "/");
    if (
        !normalized ||
        posix.isAbsolute(normalized) ||
        normalized.split("/").some((part) => !part || part === "." || part === "..")
    ) {
        throw new TypeError("Function deployment contains an unsafe path");
    }
    return normalized;
}

function safePattern(value: string): string {
    if (!value || value.startsWith("/") || value.replaceAll("\\", "/").split("/").includes("..")) {
        throw new TypeError("Function deployment contains an unsafe static pattern");
    }
    return value.replaceAll("\\", "/");
}

function text(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`Function metadata ${field} must be text`);
    }
    return value.trim();
}

function stringArray(value: unknown, field: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        throw new TypeError(`Function metadata ${field} must be a string array`);
    }
    return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value !== undefined && typeof value !== "boolean") {
        throw new TypeError(`Function metadata ${field} must be a boolean`);
    }
    return value as boolean | undefined;
}

async function bundleDigest(body: FormData): Promise<string> {
    const entries = [];
    for (const [name, value] of body.entries()) {
        if (typeof value === "string") {
            entries.push({ name, kind: "text", value });
            continue;
        }
        const file = value as unknown as File;
        entries.push({
            name,
            kind: "file",
            filename: file.name,
            mediaType: file.type,
            content: Buffer.from(await file.arrayBuffer()).toString("base64"),
        });
    }
    return await sha256Hex(canonicalJsonBytes(entries));
}
