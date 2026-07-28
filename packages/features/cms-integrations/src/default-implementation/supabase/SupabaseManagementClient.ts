import { IntegrationRuntimeError } from "../../core/errors";
import type { DataApiSchemaSyncResult } from "./types";

type ClientConfig = {
    projectRef: string;
    accessToken: string;
    apiBaseUrl: string;
    fetch: typeof fetch;
};

export class SupabaseManagementClient {
    constructor(private readonly config: ClientConfig) {}

    async applySchema(sql: string): Promise<void> {
        await this.databaseQuery(sql);
    }

    async applyMigrationTransaction(sql: string): Promise<void> {
        await this.databaseQuery(sql);
    }

    async readDatabaseRows(sql: string): Promise<Record<string, unknown>[]> {
        const response = await this.databaseQuery(sql);
        const value = await response.json();
        if (
            !Array.isArray(value) ||
            value.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))
        ) {
            throw new IntegrationRuntimeError("Supabase database query returned an invalid row set");
        }
        return value as Record<string, unknown>[];
    }

    async ensureDataApiSchemas(requiredSchemas: string[]): Promise<DataApiSchemaSyncResult> {
        const response = await this.request(`/v1/projects/${this.config.projectRef}/postgrest`, { method: "GET" });
        const current = (await response.json()) as { db_schema?: unknown };
        const schemas = csvValues(typeof current.db_schema === "string" ? current.db_schema : "");
        const next = unique([...schemas, ...requiredSchemas]);
        if (next.join(",") === schemas.join(",")) {
            return { action: "skipped", schemas: next };
        }
        await this.request(`/v1/projects/${this.config.projectRef}/postgrest`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ db_schema: next.join(",") }),
        });
        return { action: "applied", schemas: next };
    }

    async ensurePostgrestDatabaseSchemas(schemas: string[]): Promise<void> {
        const value = unique(schemas).join(",");
        await this.databaseQuery(
            [
                `alter role authenticator set pgrst.db_schemas = ${sqlString(value)};`,
                `alter role authenticator set pgrst.db_schema = ${sqlString(value)};`,
            ].join("\n"),
        );
    }

    async reloadPostgrestSchemaCache(): Promise<void> {
        await this.databaseQuery("notify pgrst, 'reload config';\nnotify pgrst, 'reload schema';");
    }

    async setFunctionSecrets(secrets: Array<{ name: string; value: string }>): Promise<void> {
        await this.request(
            `/v1/projects/${this.config.projectRef}/secrets`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(secrets),
            },
            { redactBody: true },
        );
    }

    async deployFunction(name: string, body: FormData): Promise<void> {
        await this.request(`/v1/projects/${this.config.projectRef}/functions/deploy?slug=${encodeURIComponent(name)}`, {
            method: "POST",
            body,
        });
    }

    async deployFunctionWithReceipt(name: string, body: FormData): Promise<unknown> {
        const response = await this.request(
            `/v1/projects/${this.config.projectRef}/functions/deploy?slug=${encodeURIComponent(name)}`,
            { method: "POST", body },
        );
        return await response.json();
    }

    async getFunction(name: string): Promise<unknown> {
        const response = await this.request(
            `/v1/projects/${this.config.projectRef}/functions/${encodeURIComponent(name)}`,
            { method: "GET" },
        );
        return await response.json();
    }

    private async databaseQuery(query: string): Promise<Response> {
        return await this.request(`/v1/projects/${this.config.projectRef}/database/query`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query }),
        });
    }

    private async request(path: string, init: RequestInit, options: { redactBody?: boolean } = {}): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set("authorization", `Bearer ${this.config.accessToken}`);
        const response = await this.config.fetch(`${this.config.apiBaseUrl}${path}`, { ...init, headers });
        if (response.ok) {
            return response;
        }

        const detail = options.redactBody
            ? ""
            : await response
                  .text()
                  .then((text) => text.trim().slice(0, 500))
                  .catch(() => "");
        throw new IntegrationRuntimeError(
            `Supabase API request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        );
    }
}

function csvValues(value: string): string[] {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

function sqlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}
