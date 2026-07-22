import { Buffer } from "node:buffer";
import { posix } from "node:path";

export function parseSourceMap(raw: FormDataEntryValue | null): Record<string, string> | undefined {
    if (raw === null || raw === "" || typeof raw !== "string") {
        return undefined;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return undefined;
        }
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string") {
                out[key] = value;
            }
        }
        return Object.keys(out).length > 0 ? out : undefined;
    } catch {
        return undefined;
    }
}

export function resolveDefaultContent(source: Record<string, string> | undefined): {
    content?: string;
    error?: string;
} {
    const { manifest, error } = parseSourceManifest(source);
    if (error) {
        return { error };
    }
    if (!source || !manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        return {};
    }
    const value = (manifest as { defaultContent?: unknown }).defaultContent;
    if (value === undefined || value === null || value === "") {
        return {};
    }
    if (typeof value !== "string") {
        return { error: "manifest.defaultContent must be a file path" };
    }

    const normalizedPath = normalizeSourcePath(value);
    if (!normalizedPath) {
        return { error: "manifest.defaultContent must be a relative file path" };
    }
    const encoded = source[normalizedPath] ?? source[`./${normalizedPath}`];
    if (!encoded) {
        return { error: `manifest.defaultContent file "${normalizedPath}" not found in source bundle` };
    }
    return { content: decodeSourceFile(encoded) };
}

export function parseSourceManifest(source: Record<string, string> | undefined): {
    manifest?: Record<string, unknown>;
    error?: string;
} {
    if (!source) {
        return {};
    }
    const manifestRaw = source["manifest.json"] ?? source["./manifest.json"];
    if (!manifestRaw) {
        return {};
    }
    try {
        const manifest = JSON.parse(decodeSourceFile(manifestRaw));
        if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
            return {};
        }
        return { manifest: manifest as Record<string, unknown> };
    } catch {
        return { error: "Invalid manifest.json" };
    }
}

function normalizeSourcePath(path: string): string | null {
    if (path.startsWith("/") || path.includes("\0")) {
        return null;
    }
    const normalized = posix.normalize(path).replace(/^\.\//, "");
    if (!normalized || normalized === "." || normalized.startsWith("../")) {
        return null;
    }
    return normalized;
}

function decodeSourceFile(encoded: string): string {
    return Buffer.from(encoded, "base64").toString("utf8");
}
