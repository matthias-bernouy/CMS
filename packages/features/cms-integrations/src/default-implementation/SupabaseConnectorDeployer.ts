import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { IntegrationRuntimeError } from "../core/errors";
import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployContext,
    IntegrationConnectorDeployment,
    IntegrationConnectorDeployResult,
    IntegrationConnectorFunctionDeployment,
    IntegrationConnectorResourceResult,
} from "../interfaces/IntegrationConnectorDeployer";

export type SupabaseConnectorDeployerConfig = {
    integrationsRoot: string;
    projectRef: string;
    accessToken: string;
    apiBaseUrl?: string;
    fetch?: typeof fetch;
};

type SupabaseFunctionConfig = {
    entrypoint_path?: string;
    import_map_path?: string;
    name?: string;
    static_patterns?: string[];
    verify_jwt?: boolean;
};

type FileEntry = {
    absolutePath: string;
    relativePath: string;
};

type DataApiSchemaSyncResult = {
    action: "applied" | "skipped";
    schemas: string[];
};

export class SupabaseConnectorDeployer implements IntegrationConnectorDeployer {
    readonly provider = "supabase";

    private readonly integrationsRoot: string;
    private readonly projectRef: string;
    private readonly accessToken: string;
    private readonly apiBaseUrl: string;
    private readonly fetchImpl: typeof fetch;

    constructor(config: SupabaseConnectorDeployerConfig) {
        this.integrationsRoot = config.integrationsRoot;
        this.projectRef = requiredText(config.projectRef, "projectRef");
        this.accessToken = requiredText(config.accessToken, "accessToken");
        this.apiBaseUrl = (config.apiBaseUrl ?? "https://api.supabase.com").replace(/\/+$/, "");
        this.fetchImpl = config.fetch ?? fetch;
    }

    async deploy(
        deployment: IntegrationConnectorDeployment,
        _context: IntegrationConnectorDeployContext,
    ): Promise<IntegrationConnectorDeployResult> {
        if (deployment.provider !== this.provider) {
            throw new IntegrationRuntimeError(`Supabase deployer cannot deploy provider "${deployment.provider}"`);
        }
        if (!deployment.version) {
            throw new IntegrationRuntimeError("Supabase connector deployment requires a version");
        }

        const connectorRoot = this.connectorRoot(deployment);
        const resources: IntegrationConnectorResourceResult[] = [];
        let shouldReloadPostgrestSchemaCache = false;

        for (const schema of deployment.schemas) {
            const path = safeJoin(connectorRoot, schema.path);
            const sql = await readFile(path, "utf-8");
            await this.request(`/v1/projects/${this.projectRef}/database/query`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ query: sql }),
            });
            resources.push({ type: "schema", id: schema.path, action: "applied" });
            shouldReloadPostgrestSchemaCache = true;
        }

        if (deployment.dataApiSchemas.length) {
            const { action, schemas } = await this.ensureDataApiSchemas(deployment.dataApiSchemas);
            resources.push({ type: "config", id: "postgrest.db_schema", action });
            await this.ensurePostgrestDatabaseSchemas(schemas);
            resources.push({ type: "config", id: "postgrest.database_role", action: "applied" });
            shouldReloadPostgrestSchemaCache = true;
        }

        if (shouldReloadPostgrestSchemaCache) {
            await this.reloadPostgrestSchemaCache();
            resources.push({ type: "config", id: "postgrest.schema_cache", action: "applied" });
        }

        for (const fn of deployment.functions) {
            const secrets = Object.entries(fn.secrets ?? {})
                .filter(([, value]) => value.length > 0)
                .map(([name, value]) => ({ name, value }));
            if (secrets.length) {
                await this.request(`/v1/projects/${this.projectRef}/secrets`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(secrets),
                }, { redactBody: true });
                for (const secret of secrets) {
                    resources.push({ type: "secret", id: secret.name, action: "set" });
                }
            }

            if (fn.configPath) {
                resources.push({ type: "config", id: fn.configPath, action: "applied" });
            }
            await this.deployFunction(connectorRoot, fn);
            resources.push({ type: "function", id: fn.name, action: "deployed" });
        }

        return {
            provider: this.provider,
            outputs: {
                functionsBaseUrl: `https://${this.projectRef}.supabase.co/functions/v1`,
            },
            resources,
        };
    }

    private connectorRoot(deployment: IntegrationConnectorDeployment): string {
        return safeJoin(
            this.integrationsRoot,
            deployment.integrationKind,
            "versions",
            deployment.version ?? "",
            deployment.root ?? "",
        );
    }

    private async deployFunction(connectorRoot: string, fn: IntegrationConnectorFunctionDeployment): Promise<void> {
        const functionRoot = safeJoin(connectorRoot, fn.directory);
        const files = await listFiles(functionRoot);
        if (!files.length) throw new IntegrationRuntimeError(`Supabase function "${fn.name}" has no files`);

        const config = fn.configPath
            ? parseFunctionConfig(await readFile(safeJoin(connectorRoot, fn.configPath), "utf-8"), fn.name)
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
        for (const file of files) {
            const bytes = await readFile(file.absolutePath);
            body.append("file", new Blob([bytes]), file.relativePath);
        }

        await this.request(`/v1/projects/${this.projectRef}/functions/deploy?slug=${encodeURIComponent(fn.name)}`, {
            method: "POST",
            body,
        });
    }

    private async ensureDataApiSchemas(requiredSchemas: string[]): Promise<DataApiSchemaSyncResult> {
        const response = await this.request(`/v1/projects/${this.projectRef}/postgrest`, { method: "GET" });
        const current = await response.json() as { db_schema?: unknown };
        const schemas = csvValues(typeof current.db_schema === "string" ? current.db_schema : "");
        const next = unique([...schemas, ...requiredSchemas]);
        if (next.join(",") === schemas.join(",")) return { action: "skipped", schemas: next };
        await this.request(`/v1/projects/${this.projectRef}/postgrest`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ db_schema: next.join(",") }),
        });
        return { action: "applied", schemas: next };
    }

    private async ensurePostgrestDatabaseSchemas(schemas: string[]): Promise<void> {
        const value = unique(schemas).join(",");
        await this.request(`/v1/projects/${this.projectRef}/database/query`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                query: [
                    `alter role authenticator set pgrst.db_schemas = ${sqlString(value)};`,
                    `alter role authenticator set pgrst.db_schema = ${sqlString(value)};`,
                ].join("\n"),
            }),
        });
    }

    private async reloadPostgrestSchemaCache(): Promise<void> {
        await this.request(`/v1/projects/${this.projectRef}/database/query`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: "notify pgrst, 'reload config';\nnotify pgrst, 'reload schema';" }),
        });
    }

    private async request(
        path: string,
        init: RequestInit,
        options: { redactBody?: boolean } = {},
    ): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set("authorization", `Bearer ${this.accessToken}`);
        const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, { ...init, headers });
        if (response.ok) return response;

        const detail = options.redactBody
            ? ""
            : await response.text().then(text => text.trim().slice(0, 500)).catch(() => "");
        throw new IntegrationRuntimeError(
            `Supabase API request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        );
    }
}

function parseFunctionConfig(source: string, functionName: string): SupabaseFunctionConfig {
    const config: SupabaseFunctionConfig = {};
    let active = false;
    for (const rawLine of source.split(/\r?\n/)) {
        const line = stripTomlComment(rawLine).trim();
        if (!line) continue;
        const section = line.match(/^\[(.+)]$/)?.[1]?.trim();
        if (section) {
            active = section === `functions.${functionName}` || section === `functions."${functionName}"`;
            continue;
        }
        if (!active) continue;

        const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
        if (!match) continue;
        const key = match[1]!;
        const rawValue = match[2]!;
        const value = parseTomlValue(rawValue.trim());
        if (key === "entrypoint_path" && typeof value === "string") config.entrypoint_path = value;
        if (key === "import_map_path" && typeof value === "string") config.import_map_path = value;
        if (key === "name" && typeof value === "string") config.name = value;
        if (key === "verify_jwt" && typeof value === "boolean") config.verify_jwt = value;
        if (key === "static_patterns" && isStringArray(value)) config.static_patterns = value;
    }
    return config;
}

function parseTomlValue(value: string): string | boolean | string[] | undefined {
    if (value === "true") return true;
    if (value === "false") return false;
    const quoted = value.match(/^"([^"]*)"$/);
    if (quoted) return quoted[1] ?? "";
    if (value.startsWith("[") && value.endsWith("]")) {
        const items = value.slice(1, -1).trim();
        if (!items) return [];
        return items.split(",").map(item => {
            const quotedItem = item.trim().match(/^"([^"]*)"$/);
            return quotedItem?.[1] ?? "";
        }).filter(Boolean);
    }
    return undefined;
}

function stripTomlComment(line: string): string {
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (char === "\"" && line[index - 1] !== "\\") quoted = !quoted;
        if (char === "#" && !quoted) return line.slice(0, index);
    }
    return line;
}

async function listFiles(root: string): Promise<FileEntry[]> {
    return walkFiles(root, root);
}

async function walkFiles(base: string, current: string): Promise<FileEntry[]> {
    const entries = await readdir(current, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const absolutePath = safeJoin(current, entry.name);
        if (entry.isDirectory()) return walkFiles(base, absolutePath);
        if (!entry.isFile()) return [];
        return [{ absolutePath, relativePath: relative(base, absolutePath).replaceAll(sep, "/") }];
    }));
    return files.flat().sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function safeJoin(root: string, ...parts: string[]): string {
    const base = resolve(root);
    const target = resolve(join(base, ...parts));
    const rel = relative(base, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new IntegrationRuntimeError(`Path escapes Supabase connector root: ${parts.join("/")}`);
    }
    return target;
}

function requiredText(value: string, name: string): string {
    const text = value.trim();
    if (!text) throw new IntegrationRuntimeError(`Supabase connector deployer ${name} is required`);
    return text;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === "string");
}

function csvValues(value: string): string[] {
    return value.split(",").map(item => item.trim()).filter(Boolean);
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function sqlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}
