import { MongoClient } from "mongodb";
import type { Connection } from "../scenarios/client";

type SearchObservation = {
    status: number;
    ms: number;
    error: unknown;
    isError: boolean;
    mode?: string;
    degraded?: boolean;
    results: number;
    responseBody?: unknown;
};

export async function clearDerivedVectors(mongoUrl: string) {
    const client = new MongoClient(mongoUrl);
    let removed = 0;
    try {
        await client.connect();
        for (const { name } of (await client.db().admin().listDatabases()).databases) {
            const database = client.db(name);
            if (await database.listCollections({ name: "cms_documentation_vectors" }).hasNext()) {
                removed += (await database.collection("cms_documentation_vectors").deleteMany({})).deletedCount;
            }
        }
        return removed;
    } finally {
        await client.close();
    }
}

export async function searchProbe(
    connection: Connection,
    cmsUrl: string,
    index: number,
    filtered = false,
): Promise<SearchObservation> {
    const queries = [
        ["How do I verify a page before publishing?", "ulvia/cms.content"],
        ["How do I create a minimal collection with one panel?", "ulvia/cms.authoring"],
        ["Comment transmettre les octets d'un fichier privé ?", "ulvia/cms.files"],
    ];
    const [query, contractId] = queries[index % queries.length]!;
    const tool = connection.tools.find((entry) => entry._meta["io.ulvia/capability"] === "documentation.search")!;
    const started = performance.now();
    try {
        const response = await fetch(`${cmsUrl}/.cms/mcp`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${connection.token.access_token}`,
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
                "MCP-Protocol-Version": "2025-11-25",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: index + 1,
                method: "tools/call",
                params: {
                    name: tool.name,
                    arguments: { input: { query, limit: 3, ...(filtered ? { contractId } : {}) } },
                },
            }),
            signal: AbortSignal.timeout(60_000),
        });
        const body = await response.json();
        const result = body.result;
        let error = body.error ?? result?.structuredContent?.error;
        if (!error && result?.isError) {
            try {
                error = JSON.parse(
                    result.content?.find((item: { type: string }) => item.type === "text")?.text ?? "{}",
                ).error;
            } catch {
                error = { code: "unparseable_error" };
            }
        }
        return {
            status: response.status,
            ms: Math.round(performance.now() - started),
            error: error ?? null,
            isError: result?.isError === true,
            mode: result?.structuredContent?.output?.mode,
            degraded: result?.structuredContent?.output?.degraded,
            results: result?.structuredContent?.output?.results?.length ?? 0,
            ...(response.ok ? {} : { responseBody: body }),
        };
    } catch (error) {
        return {
            status: 0,
            ms: Math.round(performance.now() - started),
            error: String(error),
            results: 0,
            isError: true,
        };
    }
}
