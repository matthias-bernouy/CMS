import { describe, test, expect } from "bun:test";

import handler from "src/control/api/data/provider/validate.post";

const FAKE_CMS = {} as never;

async function call(body: unknown): Promise<{ ok: boolean; referenced?: string[]; errors?: Array<{ path: string; message: string }> }> {
    const res = await handler(
        new Request("http://x/api/data/provider/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        FAKE_CMS,
    );
    return await res.json() as { ok: boolean; referenced?: string[]; errors?: Array<{ path: string; message: string }> };
}

describe("POST /api/data/provider/validate", () => {
    test("rules as JSON string is parsed and validated", async () => {
        const r = await call({
            rules: JSON.stringify({
                defaults: { on_request: [
                    { type: "inject_header", name: "Authorization", value: "Bearer ${env:K}" },
                ] },
                paths: {},
            }),
            secrets: { K: "v" },
        });
        expect(r.ok).toBe(true);
        expect(r.referenced).toEqual(["K"]);
    });

    test("rules as object is also accepted", async () => {
        const r = await call({
            rules: {
                defaults: { on_request: [
                    { type: "inject_header", name: "X-K", value: "${env:K}" },
                ] },
                paths: {},
            },
        });
        expect(r.ok).toBe(true);
        expect(r.referenced).toEqual(["K"]);
    });

    test("missing referenced secret is rejected with envName in message", async () => {
        const r = await call({
            rules: JSON.stringify({
                defaults: { on_request: [
                    { type: "inject_header", name: "X", value: "${env:MISSING}" },
                ] },
                paths: {},
            }),
            secrets: {},
        });
        expect(r.ok).toBe(false);
        expect(r.errors?.[0]?.message).toMatch(/MISSING/);
    });

    test("invalid JSON returns ok=false with $ as path", async () => {
        const r = await call({ rules: "{ broken" });
        expect(r.ok).toBe(false);
        expect(r.errors?.[0]?.path).toBe("$");
    });

    test("forbidden header in rules is rejected with its JSON-pointer path", async () => {
        const r = await call({
            rules: JSON.stringify({ paths: { "/x": { on_request: [
                { type: "inject_header", name: "Set-Cookie", value: "x" },
            ] } } }),
        });
        expect(r.ok).toBe(false);
        expect(r.errors?.[0]?.path).toContain("$.paths");
    });
});
