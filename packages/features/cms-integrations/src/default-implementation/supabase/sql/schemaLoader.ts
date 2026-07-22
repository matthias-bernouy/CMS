import { readFile, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { IntegrationRuntimeError } from "../../../core/errors";
import type { IntegrationConnectorSchemaDeployment } from "../../../interfaces/IntegrationConnectorDeployer";
import { assembleSupabaseSqlBundle } from "./bundleLoader";
import { resolveSqlReference } from "./pathSecurity";

export type LoadedSupabaseSqlSchema = {
    id: string;
    kind: "bundle" | "legacy";
    sql: string;
    sourceFiles: string[];
};

export async function loadSupabaseSqlSchemas(
    connectorRoot: string,
    schemas: IntegrationConnectorSchemaDeployment[],
): Promise<LoadedSupabaseSqlSchema[]> {
    const root = await realpath(connectorRoot);
    const anchor = join(root, "connector.json");
    const loaded: LoadedSupabaseSqlSchema[] = [];
    for (const schema of schemas) {
        const reference = schemaReference(schema);
        const path = await resolveSqlReference({
            connectorRoot: root,
            bundleRoot: root,
            fromFile: anchor,
            reference: reference.value,
            extension: reference.kind === "bundle" ? ".json" : ".sql",
        });
        if (reference.kind === "bundle") {
            const bundle = await assembleSupabaseSqlBundle(root, path);
            loaded.push({ id: reference.value, kind: "bundle", ...bundle });
        } else {
            loaded.push({
                id: reference.value,
                kind: "legacy",
                sql: await readLegacySql(path),
                sourceFiles: [relative(root, path).split(sep).join("/")],
            });
        }
    }
    return loaded;
}

export async function loadSupabaseSqlBundle(connectorRoot: string, manifest: string): Promise<LoadedSupabaseSqlSchema> {
    const root = await realpath(connectorRoot);
    const path = await resolveSqlReference({
        connectorRoot: root,
        bundleRoot: root,
        fromFile: join(root, "connector.json"),
        reference: manifest,
        extension: ".json",
    });
    return { id: manifest, kind: "bundle", ...(await assembleSupabaseSqlBundle(root, path)) };
}

function schemaReference(schema: IntegrationConnectorSchemaDeployment): { kind: "bundle" | "legacy"; value: string } {
    if (!schema || typeof schema !== "object") {
        throw new IntegrationRuntimeError("Supabase schema entry must be an object");
    }
    const keys = Object.keys(schema);
    if (keys.length !== 1 || (keys[0] !== "path" && keys[0] !== "manifest")) {
        throw new IntegrationRuntimeError("Supabase schema entry must define exactly one path or manifest");
    }
    const key = keys[0] as "manifest" | "path";
    const value = schema[key];
    if (typeof value !== "string") {
        throw new IntegrationRuntimeError(`Supabase schema ${key} must be a string`);
    }
    return { kind: key === "manifest" ? "bundle" : "legacy", value };
}

async function readLegacySql(path: string): Promise<string> {
    return await readFile(path, "utf-8");
}
