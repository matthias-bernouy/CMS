import { SQL } from "bun";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";

type FunctionReceipt = Readonly<{ slug: string; status: "ACTIVE"; ezbr_sha256: string }>;
export const OFFICIAL_SUPABASE_PROJECT_REF = "official-photo-albums-migration";
const PROJECT_PATH = `/v1/projects/${OFFICIAL_SUPABASE_PROJECT_REF}`;

export class RealPostgresSupabaseManagementApi {
    readonly databaseMutationDigests: string[] = [];
    readonly functionDeployments = new Map<string, number>();
    readonly functionDeploymentDigests = new Map<string, string[]>();
    private readonly functions = new Map<string, FunctionReceipt>();

    constructor(
        private readonly database: SQL,
        private readonly accessToken: string,
    ) {}

    readonly fetch: typeof fetch = async (input, init) => {
        const request = input instanceof Request ? input : undefined;
        const headers = new Headers(request?.headers);
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        if (headers.get("authorization") !== `Bearer ${this.accessToken}`) {
            return Response.json({ code: "invalid-token" }, { status: 401 });
        }
        const url = new URL(request?.url ?? String(input));
        const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
        const body = init?.body ?? request?.body;
        if (url.pathname === `${PROJECT_PATH}/database/query`) {
            if (method !== "POST") {
                return protocolError(405, "method-not-allowed");
            }
            if (headers.get("content-type") !== "application/json") {
                return protocolError(415, "unsupported-media-type");
            }
            return await this.databaseResponse(body);
        }
        if (url.pathname === `${PROJECT_PATH}/functions/deploy`) {
            if (method !== "POST") {
                return protocolError(405, "method-not-allowed");
            }
            if (!(body instanceof FormData)) {
                return protocolError(415, "unsupported-media-type");
            }
            return await this.deployFunction(url, body);
        }
        const functionPrefix = `${PROJECT_PATH}/functions/`;
        if (url.pathname.startsWith(functionPrefix) && !url.pathname.slice(functionPrefix.length).includes("/")) {
            if (method !== "GET") {
                return protocolError(405, "method-not-allowed");
            }
            return this.functionResponse(decodeURIComponent(url.pathname.slice(functionPrefix.length)));
        }
        return protocolError(404, "unsupported-management-route");
    };

    resetMigrationObservations(): void {
        this.databaseMutationDigests.length = 0;
        this.functionDeployments.clear();
        this.functionDeploymentDigests.clear();
    }

    functionReceipt(slug: string): FunctionReceipt | undefined {
        return this.functions.get(slug);
    }

    private async databaseResponse(body: BodyInit | ReadableStream<Uint8Array> | null | undefined): Promise<Response> {
        const query = requestQuery(body);
        try {
            const rows = await this.database.unsafe(query);
            if (query.trimStart().startsWith("BEGIN;")) {
                this.databaseMutationDigests.push(await sha256Hex(new TextEncoder().encode(query)));
            }
            return Response.json(jsonValue([...rows]), { status: 201 });
        } catch (error) {
            await this.database.unsafe("ROLLBACK").catch(() => undefined);
            const message = error instanceof Error ? error.message : "database query failed";
            return Response.json({ code: "database-query-failed", message }, { status: 400 });
        }
    }

    private async deployFunction(url: URL, body: FormData): Promise<Response> {
        const slug = url.searchParams.get("slug")?.trim();
        if (!slug) {
            return Response.json({ code: "invalid-function-deployment" }, { status: 400 });
        }
        const digest = await functionBundleDigest(body);
        const receipt: FunctionReceipt = {
            slug,
            status: "ACTIVE",
            ezbr_sha256: digest,
        };
        this.functions.set(slug, receipt);
        this.functionDeployments.set(slug, (this.functionDeployments.get(slug) ?? 0) + 1);
        this.functionDeploymentDigests.set(slug, [...(this.functionDeploymentDigests.get(slug) ?? []), digest]);
        return Response.json(receipt, { status: 201 });
    }

    private functionResponse(slug: string): Response {
        const receipt = this.functions.get(slug);
        return receipt ? Response.json(receipt) : Response.json({ code: "function-not-found" }, { status: 404 });
    }
}

function requestQuery(body: BodyInit | ReadableStream<Uint8Array> | null | undefined): string {
    const parsed = JSON.parse(String(body)) as { query?: unknown };
    if (typeof parsed.query !== "string" || !parsed.query.trim()) {
        throw new TypeError("Supabase database request has no SQL query");
    }
    return parsed.query;
}

function protocolError(status: number, code: string): Response {
    return Response.json({ code }, { status });
}

async function functionBundleDigest(body: FormData): Promise<string> {
    const entries = [];
    for (const [name, value] of body.entries()) {
        if (typeof value === "string") {
            entries.push({ name, kind: "text", value });
            continue;
        }
        entries.push({
            name,
            kind: "file",
            filename: value.name,
            mediaType: value.type,
            content: Buffer.from(await value.arrayBuffer()).toString("base64"),
        });
    }
    return await sha256Hex(canonicalJsonBytes(entries));
}

function jsonValue(value: unknown): unknown {
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(jsonValue);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
    }
    return value;
}
