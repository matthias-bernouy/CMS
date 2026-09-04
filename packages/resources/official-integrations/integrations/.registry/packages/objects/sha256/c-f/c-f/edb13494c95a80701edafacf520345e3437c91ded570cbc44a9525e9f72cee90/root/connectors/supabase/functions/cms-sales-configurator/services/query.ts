import { integer, nonNegativeInteger, text } from "../core/records.ts";

export interface ListQuery {
    limit: number;
    offset: number;
    query?: string;
    status?: string;
}

export function listQuery(request: Request): ListQuery {
    const params = new URL(request.url).searchParams;
    return {
        limit: Math.min(integer(params.get("limit"), "limit") ?? 50, 100),
        offset: nonNegativeInteger(params.get("offset"), "offset") ?? 0,
        query: safeSearch(params.get("q")),
        status: text(params.get("status")),
    };
}

export function addSearch(params: URLSearchParams, query: string | undefined, ...columns: string[]): void {
    if (query && columns.length) {
        params.set("or", `(${columns.map((column) => `${column}.ilike.*${query}*`).join(",")})`);
    }
}

function safeSearch(value: string | null): string | undefined {
    return text(value)
        ?.replace(/[,*()[\]{}]/g, " ")
        .slice(0, 120);
}
