import { expect } from "bun:test";
import { supabaseUrl } from "../runtime";
import type { JsonRecord } from "../types";
import { filterValue, jsonResponse, requestFromFetchInput, same } from "./http";

export class EmailerRestMock {
    private readonly tables: Record<string, JsonRecord[]> = {
        templates: [],
        messages: [],
        settings: [
            {
                id: "default",
                smtp_host: null,
                smtp_port: null,
                smtp_secure: null,
                smtp_user: null,
                smtp_password: null,
                default_from: null,
                default_reply_to: null,
                created_at: "2026-07-09T10:00:00.000Z",
                updated_at: "2026-07-09T10:00:00.000Z",
            },
        ],
    };

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin !== supabaseUrl || !url.pathname.startsWith("/rest/v1/")) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }
        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        expect(request.headers.get("accept-profile")).toBe("emailer");
        if (method !== "GET" && method !== "HEAD") {
            expect(request.headers.get("content-profile")).toBe("emailer");
        }

        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) {
            throw new Error(`unexpected table: ${table}`);
        }
        if (method === "GET") {
            const rows = this.select(table, url);
            return jsonResponse(rows, 200, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
        }
        if (method === "POST") {
            const payload = JSON.parse(await request.text()) as JsonRecord | JsonRecord[];
            const values = Array.isArray(payload) ? payload : [payload];
            const ignoreDuplicates = request.headers.get("prefer")?.includes("resolution=ignore-duplicates") === true;
            const inserted: JsonRecord[] = [];
            for (const row of values) {
                if (
                    table === "messages" &&
                    typeof row.idempotency_key === "string" &&
                    this.tables.messages?.some((item) => same(item.idempotency_key, row.idempotency_key))
                ) {
                    return jsonResponse({ message: "duplicate idempotency key" }, 409);
                }
                const next = this.insertOrUpsert(table, row, ignoreDuplicates);
                if (next) {
                    inserted.push(next);
                }
            }
            return jsonResponse(inserted, 201);
        }
        if (method === "PATCH") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            return jsonResponse(this.patch(table, url, row), 200);
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map((row) => ({ ...row }));
    }

    private select(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        for (const key of ["key", "id", "idempotency_key", "status", "template_key"]) {
            const filter = filterValue(url.searchParams.get(key));
            if (filter?.operator === "eq") {
                rows = rows.filter((row) => same(row[key], filter.value));
            }
        }
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? rows.length);
        return rows.slice(offset, offset + limit).map((row) => ({ ...row }));
    }

    private insertOrUpsert(table: string, value: JsonRecord, ignoreDuplicates = false): JsonRecord | null {
        const rows = this.tables[table]!;
        const now = new Date().toISOString();
        if (table === "templates") {
            const index = rows.findIndex((row) => same(row.key, value.key));
            if (index >= 0 && ignoreDuplicates) {
                return null;
            }
            const next = {
                ...(index >= 0 ? rows[index] : { created_at: now }),
                ...value,
                updated_at: now,
            };
            if (index >= 0) {
                rows[index] = next;
            } else {
                rows.push(next);
            }
            return { ...next };
        }
        if (table === "settings") {
            const id = String(value.id ?? "default");
            const index = rows.findIndex((row) => same(row.id, id));
            const next = {
                ...(index >= 0 ? rows[index] : { id, created_at: now }),
                ...value,
                updated_at: now,
            };
            if (index >= 0) {
                rows[index] = next;
            } else {
                rows.push(next);
            }
            return { ...next };
        }
        const next = {
            created_at: now,
            updated_at: now,
            ...value,
        };
        rows.push(next);
        return { ...next };
    }

    private patch(table: string, url: URL, value: JsonRecord): JsonRecord[] {
        const rows = this.tables[table]!;
        const filters = ["key", "id", "status", "reservation_token"]
            .map((key) => [key, filterValue(url.searchParams.get(key))] as const)
            .filter((entry) => entry[1] !== null);
        const patched: JsonRecord[] = [];
        this.tables[table] = rows.map((row) => {
            const match = filters.every(([key, filter]) => filter?.operator === "eq" && same(row[key], filter.value));
            if (!match) {
                return row;
            }
            const next = { ...row, ...value, updated_at: new Date().toISOString() };
            patched.push(next);
            return next;
        });
        return patched;
    }
}
