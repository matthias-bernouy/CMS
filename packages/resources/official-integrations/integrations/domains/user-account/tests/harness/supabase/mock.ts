import { expect } from "bun:test";
import { supabaseUrl } from "../runtime";
import type { JsonRecord } from "../types";
import { filterValue, jsonResponse, requestFromFetchInput, same } from "./http";

export class UserAccountSupabaseMock {
    private readonly tables: Record<string, JsonRecord[]> = {
        accounts: [],
        extra_fields: [],
    };
    private readonly storageObjects = new Map<string, { body: string; headers: Headers }>();

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin !== supabaseUrl) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }
        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        if (url.pathname.startsWith("/storage/v1/object/")) {
            return await this.storageFetch(request, url, method);
        }
        if (!url.pathname.startsWith("/rest/v1/")) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }

        expect(request.headers.get("accept-profile")).toBe("user_account");
        if (method !== "GET" && method !== "HEAD") {
            expect(request.headers.get("content-profile")).toBe("user_account");
        }
        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) {
            throw new Error(`unexpected table: ${table}`);
        }
        if (method === "GET") {
            return jsonResponse(this.select(table, url));
        }
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            const inserted = this.insert(table, row, url.searchParams.get("on_conflict") === "id");
            return jsonResponse([inserted], 201);
        }
        if (method === "PATCH") {
            const patch = JSON.parse(await request.text()) as JsonRecord;
            const rows = this.selectRefs(table, url).map((row) => this.update(table, row, patch));
            return jsonResponse(rows);
        }
        if (method === "DELETE") {
            const deleted = this.delete(table, url);
            return jsonResponse(deleted);
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map((row) => ({ ...row }));
    }

    private async storageFetch(request: Request, url: URL, method: string): Promise<Response> {
        const prefix = "/storage/v1/object/user-account-avatars/";
        const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
        if (method === "POST") {
            this.storageObjects.set(objectPath, {
                body: await request.text(),
                headers: new Headers({
                    "content-type": request.headers.get("content-type") ?? "application/octet-stream",
                    etag: "etag-1",
                }),
            });
            return jsonResponse({ Key: objectPath }, 200);
        }
        if (method === "GET") {
            const object = this.storageObjects.get(objectPath);
            if (!object) {
                return jsonResponse({ message: "not found" }, 404);
            }
            return new Response(object.body, { status: 200, headers: object.headers });
        }
        throw new Error(`unexpected storage method: ${method} ${url}`);
    }

    private select(table: string, url: URL): JsonRecord[] {
        return this.selectRefs(table, url).map((row) => ({ ...row }));
    }

    private selectRefs(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        const userId = filterValue(url.searchParams.get("cms_user_id"));
        const id = filterValue(url.searchParams.get("id"));
        const or = url.searchParams.get("or");
        if (userId?.operator === "eq") {
            rows = rows.filter((row) => same(row.cms_user_id, userId.value));
        }
        if (id?.operator === "eq") {
            rows = rows.filter((row) => same(row.id, id.value));
        }
        if (or) {
            const search = or.match(/ilike\.\*([^*]+)\*/)?.[1]?.toLowerCase() ?? "";
            rows = rows.filter((row) =>
                ["cms_user_id", "phone", "given_name", "surname", "display_name"].some((key) =>
                    String(row[key] ?? "")
                        .toLowerCase()
                        .includes(search),
                ),
            );
        }
        if (table === "extra_fields") {
            rows = [...rows].sort(
                (left, right) =>
                    Number(left.position ?? 0) - Number(right.position ?? 0) ||
                    String(left.id).localeCompare(String(right.id)),
            );
        }
        return rows;
    }

    private insert(table: string, value: JsonRecord, upsert = false): JsonRecord {
        const now = "2026-07-06T11:00:00.000Z";
        if (table === "extra_fields" && upsert) {
            const existing = this.tables[table]!.find((row) => same(row.id, value.id));
            if (existing) {
                return this.update(table, existing, value);
            }
        }
        const row =
            table === "extra_fields"
                ? {
                      required: false,
                      show_in_dashboard_table: false,
                      position: this.tables[table]!.length,
                      ...value,
                      created_at: now,
                      updated_at: now,
                  }
                : { ...value, created_at: now, updated_at: now };
        this.tables[table]!.push(row);
        return { ...row };
    }

    private update(table: string, row: JsonRecord, patch: JsonRecord): JsonRecord {
        Object.assign(row, patch, { updated_at: "2026-07-06T11:15:00.000Z" });
        return { ...row };
    }

    private delete(table: string, url: URL): JsonRecord[] {
        const userId = filterValue(url.searchParams.get("cms_user_id"));
        const id = filterValue(url.searchParams.get("id"));
        const deleted: JsonRecord[] = [];
        this.tables[table] = this.tables[table]!.filter((row) => {
            const match =
                (userId?.operator === "eq" && same(row.cms_user_id, userId.value)) ||
                (id?.operator === "eq" && same(row.id, id.value));
            if (match) {
                deleted.push(table === "extra_fields" ? { id: row.id } : { cms_user_id: row.cms_user_id });
            }
            return !match;
        });
        return deleted;
    }
}
