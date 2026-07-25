import { decodeIntegrationPackageFile, resolveIntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import { readBoundedRegularFile, readIntegrationPackageFiles } from "@bernouy/cms-integration-packages/fs";
import { IntegrationRuntimeError } from "../../core/errors";
import type { IntegrationConnectorFunctionDeployment } from "../../interfaces/IntegrationConnectorDeployer";
import { resolveExistingSupabaseDirectory, resolveExistingSupabaseFile } from "./paths";

type SupabaseFunctionConfig = {
    entrypoint_path?: string;
    import_map_path?: string;
    name?: string;
    static_patterns?: string[];
    verify_jwt?: boolean;
};

export const SUPABASE_FUNCTION_BUNDLE_LIMITS = resolveIntegrationPackageLimits({
    maxDepth: 24,
    maxDirectories: 1_024,
    maxFiles: 1_024,
    maxFileBytes: 8 * 1_024 * 1_024,
    maxDecodedBytes: 16 * 1_024 * 1_024,
});

const SUPABASE_FUNCTION_CONFIG_LIMITS = resolveIntegrationPackageLimits({
    maxFileBytes: 1 * 1_024 * 1_024,
    maxDecodedBytes: 1 * 1_024 * 1_024,
});

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export async function buildFunctionBody(
    connectorRoot: string,
    fn: IntegrationConnectorFunctionDeployment,
): Promise<FormData> {
    const functionRoot = await resolveExistingSupabaseDirectory(connectorRoot, fn.directory);
    const files = await readIntegrationPackageFiles(functionRoot, SUPABASE_FUNCTION_BUNDLE_LIMITS);
    const paths = Object.keys(files).sort();
    if (!paths.length) {
        throw new IntegrationRuntimeError(`Supabase function "${fn.name}" has no files`);
    }

    const config = fn.configPath
        ? parseFunctionConfig(await readFunctionConfig(connectorRoot, fn.configPath), fn.name)
        : {};
    const metadata = {
        entrypoint_path: config.entrypoint_path ?? "index.ts",
        ...(config.import_map_path ? { import_map_path: config.import_map_path } : {}),
        ...(config.static_patterns ? { static_patterns: config.static_patterns } : {}),
        ...(config.verify_jwt !== undefined ? { verify_jwt: config.verify_jwt } : {}),
        ...(config.name ? { name: config.name } : {}),
    };
    const body = new FormData();
    body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
    for (const path of paths) {
        const bytes = Uint8Array.from(decodeIntegrationPackageFile(files[path]!)).buffer;
        body.append("file", new Blob([bytes]), path);
    }
    return body;
}

async function readFunctionConfig(connectorRoot: string, configPath: string): Promise<string> {
    const path = await resolveExistingSupabaseFile(connectorRoot, configPath);
    const bytes = await readBoundedRegularFile(path, 0, SUPABASE_FUNCTION_CONFIG_LIMITS);
    try {
        return strictUtf8.decode(bytes);
    } catch {
        throw new IntegrationRuntimeError(`Supabase function config must be valid UTF-8: ${configPath}`);
    }
}

function parseFunctionConfig(source: string, functionName: string): SupabaseFunctionConfig {
    const config: SupabaseFunctionConfig = {};
    let active = false;
    for (const rawLine of source.split(/\r?\n/)) {
        const line = stripTomlComment(rawLine).trim();
        if (!line) {
            continue;
        }
        const section = line.match(/^\[(.+)]$/)?.[1]?.trim();
        if (section) {
            active = section === `functions.${functionName}` || section === `functions."${functionName}"`;
            continue;
        }
        if (!active) {
            continue;
        }

        const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
        if (!match) {
            continue;
        }
        assignConfigValue(config, match[1]!, parseTomlValue(match[2]!.trim()));
    }
    return config;
}

function assignConfigValue(config: SupabaseFunctionConfig, key: string, value: unknown): void {
    if ((key === "entrypoint_path" || key === "import_map_path" || key === "name") && typeof value === "string") {
        config[key] = value;
    }
    if (key === "verify_jwt" && typeof value === "boolean") {
        config.verify_jwt = value;
    }
    if (key === "static_patterns" && isStringArray(value)) {
        config.static_patterns = value;
    }
}

function parseTomlValue(value: string): string | boolean | string[] | undefined {
    if (value === "true" || value === "false") {
        return value === "true";
    }
    const quoted = value.match(/^"([^"]*)"$/);
    if (quoted) {
        return quoted[1] ?? "";
    }
    if (!value.startsWith("[") || !value.endsWith("]")) {
        return undefined;
    }
    const items = value.slice(1, -1).trim();
    if (!items) {
        return [];
    }
    return items
        .split(",")
        .map((item) => item.trim().match(/^"([^"]*)"$/)?.[1] ?? "")
        .filter(Boolean);
}

function stripTomlComment(line: string): string {
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (char === '"' && line[index - 1] !== "\\") {
            quoted = !quoted;
        }
        if (char === "#" && !quoted) {
            return line.slice(0, index);
        }
    }
    return line;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
