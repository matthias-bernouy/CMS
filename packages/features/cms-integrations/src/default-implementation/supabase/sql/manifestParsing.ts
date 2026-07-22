import { IntegrationRuntimeError } from "../../../core/errors";
import { SUPABASE_SQL_BUNDLE_SCHEMA } from "./constants";

export type SupabaseSqlManifestEntry = { file: string } | { manifest: string };

export type SupabaseSqlManifest = {
    schema: typeof SUPABASE_SQL_BUNDLE_SCHEMA;
    transaction: "atomic";
    entries: SupabaseSqlManifestEntry[];
};

export function parseSupabaseSqlManifest(value: unknown, source: string): SupabaseSqlManifest {
    const manifest = record(value, source);
    assertKeys(manifest, ["schema", "transaction", "entries"], source);
    if (manifest.schema !== SUPABASE_SQL_BUNDLE_SCHEMA) {
        invalid(source, `schema must be "${SUPABASE_SQL_BUNDLE_SCHEMA}"`);
    }
    if (manifest.transaction !== "atomic") {
        invalid(source, 'transaction must be "atomic"');
    }
    if (!Array.isArray(manifest.entries)) {
        invalid(source, "entries must be an array");
    }
    return {
        schema: SUPABASE_SQL_BUNDLE_SCHEMA,
        transaction: "atomic",
        entries: manifest.entries.map((entry, index) => parseEntry(entry, `${source}.entries.${index}`)),
    };
}

function parseEntry(value: unknown, source: string): SupabaseSqlManifestEntry {
    const entry = record(value, source);
    const keys = Object.keys(entry);
    if (keys.length !== 1 || (keys[0] !== "file" && keys[0] !== "manifest")) {
        invalid(source, "must contain exactly one file or manifest property");
    }
    const key = keys[0] as "file" | "manifest";
    const reference = entry[key];
    if (typeof reference !== "string" || !reference.length || reference !== reference.trim()) {
        invalid(`${source}.${key}`, "must be a non-empty string without surrounding whitespace");
    }
    return key === "file" ? { file: reference } : { manifest: reference };
}

function record(value: unknown, source: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid(source, "must be an object");
    }
    return value as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, expected: string[], source: string): void {
    const keys = Object.keys(value);
    if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
        invalid(source, `must contain exactly ${expected.join(", ")}`);
    }
}

function invalid(source: string, message: string): never {
    throw new IntegrationRuntimeError(`Invalid Supabase SQL manifest ${source}: ${message}`);
}
