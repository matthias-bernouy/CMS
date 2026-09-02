import { timingSafeEqual } from "node:crypto";
import type { LocalSupabaseDatabase } from "./database";
import type { LocalSupabaseFunctionsRuntime } from "./functions-runtime";
import type { LocalSupabaseProject } from "./project";

export async function handleLocalSupabaseManagementRequest(
    request: Request,
    basePath: string,
    accessToken: string,
    project: LocalSupabaseProject,
    database: LocalSupabaseDatabase,
    functionsRuntime: LocalSupabaseFunctionsRuntime,
): Promise<Response> {
    if (!authorized(request.headers.get("authorization"), accessToken)) {
        return json({ code: "invalid-token" }, 401);
    }
    const url = new URL(request.url);
    try {
        if (url.pathname === `${basePath}/database/query` && request.method === "POST") {
            return await databaseQuery(request, database);
        }
        if (url.pathname === `${basePath}/postgrest` && request.method === "GET") {
            return json({ db_schema: project.dataApiSchemas().join(",") });
        }
        if (url.pathname === `${basePath}/postgrest` && request.method === "PATCH") {
            const schemas = dataApiSchemas((await jsonBody(request)).db_schema);
            await project.setDataApiSchemas(schemas);
            return json({ db_schema: schemas.join(",") });
        }
        if (url.pathname === `${basePath}/secrets` && request.method === "POST") {
            await project.setSecrets(secretEntries(await request.json()));
            return json({});
        }
        if (url.pathname === `${basePath}/functions/deploy` && request.method === "POST") {
            const slug = functionSlug(url.searchParams.get("slug"));
            const receipt = await project.deployFunction(slug, await request.formData());
            await functionsRuntime.reload();
            return json(receipt, 201);
        }
        const functionPrefix = `${basePath}/functions/`;
        if (request.method === "GET" && url.pathname.startsWith(functionPrefix)) {
            const slug = functionSlug(decodeURIComponent(url.pathname.slice(functionPrefix.length)));
            const receipt = project.functionReceipt(slug);
            return receipt ? json(receipt) : json({ code: "function-not-found" }, 404);
        }
        return json({ code: "unsupported-management-route" }, 404);
    } catch (error) {
        return json({ code: "invalid-management-request", message: safeMessage(error) }, 400);
    }
}

async function databaseQuery(request: Request, database: LocalSupabaseDatabase): Promise<Response> {
    const body = await jsonBody(request);
    if (typeof body.query !== "string" || !body.query.trim()) {
        return json({ code: "invalid-database-query" }, 400);
    }
    try {
        return json(await database.query(body.query), 201);
    } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "database query failed";
        return json({ code: "database-query-failed", message }, 400);
    }
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        throw new TypeError("Expected an application/json request");
    }
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Expected a JSON object");
    }
    return value as Record<string, unknown>;
}

function dataApiSchemas(value: unknown): string[] {
    if (typeof value !== "string") {
        throw new TypeError("db_schema must be a comma-separated string");
    }
    const schemas = [
        ...new Set(
            value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean),
        ),
    ];
    if (!schemas.length || schemas.some((schema) => !/^[a-z_][a-z0-9_]*$/u.test(schema))) {
        throw new TypeError("db_schema contains an invalid schema name");
    }
    return schemas;
}

function secretEntries(value: unknown): Array<{ name: string; value: string }> {
    if (!Array.isArray(value)) {
        throw new TypeError("Secrets must be an array");
    }
    return value.map((entry) => {
        const record = entry as Record<string, unknown>;
        if (
            !entry ||
            typeof entry !== "object" ||
            !/^[A-Z][A-Z0-9_]*$/u.test(String(record.name ?? "")) ||
            typeof record.value !== "string" ||
            record.value.includes("\0")
        ) {
            throw new TypeError("Secret entry is invalid");
        }
        return { name: String(record.name), value: record.value };
    });
}

function functionSlug(value: string | null): string {
    const slug = value?.trim() ?? "";
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/u.test(slug)) {
        throw new TypeError("Function slug is invalid");
    }
    return slug;
}

function authorized(header: string | null, token: string): boolean {
    const received = Buffer.from(header ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    return received.length === expected.length && timingSafeEqual(received, expected);
}

function safeMessage(error: unknown): string {
    return error instanceof SyntaxError || error instanceof TypeError ? error.message.slice(0, 300) : "request failed";
}

function json(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
