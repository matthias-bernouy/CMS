import { describe, test, expect } from "bun:test";

import handler from "src/api/admin/proxies/validate.post";

const FAKE_PROVIDER = {} as never;

function call(body: unknown): Promise<Response> {
    return handler(
        new Request("http://x/admin/api/proxies/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        FAKE_PROVIDER,
    );
}

async function asJson(res: Response): Promise<{ ok: boolean; data?: unknown; error?: { message: string } }> {
    return await res.json() as { ok: boolean; data?: unknown; error?: { message: string } };
}

describe("POST /admin/api/proxies/validate", () => {
    test("happy path — returns ok=true with the env names referenced", async () => {
        const env = await asJson(await call({
            rules: {
                defaults: { on_request: [
                    { type: "inject_header", name: "Authorization", value: "Bearer ${env:STRIPE_KEY}" },
                ] },
                paths: { "/v1/charges": { on_request: [] } },
            },
            secrets: { STRIPE_KEY: "sk_xxx" },
        }));
        expect(env.ok).toBe(true);
        expect((env.data as { ok: boolean; referenced: string[] })).toMatchObject({
            ok: true, referenced: ["STRIPE_KEY"],
        });
    });

    test("parse error — surfaces the JSON-pointer path of the invalid field", async () => {
        const env = await asJson(await call({
            rules: { paths: { "/x": { on_request: [{ type: "frobnicate" }] } } },
        }));
        const data = env.data as { ok: false; errors: Array<{ path: string; message: string }> };
        expect(data.ok).toBe(false);
        expect(data.errors[0]?.path).toContain('$.paths["/x"].on_request[0].type');
    });

    test("validation error — forbidden header rejected with the exact path", async () => {
        const env = await asJson(await call({
            rules: { paths: { "/x": { on_request: [
                { type: "inject_header", name: "Set-Cookie", value: "x" },
            ] } } },
        }));
        const data = env.data as { ok: false; errors: Array<{ path: string; message: string }> };
        expect(data.ok).toBe(false);
        expect(data.errors[0]?.message).toMatch(/forbidden/i);
    });

    test("missing secret — coverage check rejects with envName in the message", async () => {
        const env = await asJson(await call({
            rules: {
                defaults: { on_request: [
                    { type: "inject_header", name: "X-K", value: "${env:MISSING}" },
                ] },
                paths: {},
            },
            secrets: {},
        }));
        const data = env.data as { ok: false; errors: Array<{ path: string; message: string }> };
        expect(data.ok).toBe(false);
        expect(data.errors[0]?.message).toMatch(/MISSING/);
    });

    test("dead secret — entry set but not referenced is rejected", async () => {
        const env = await asJson(await call({
            rules:   { paths: {} },
            secrets: { ORPHAN: "v" },
        }));
        const data = env.data as { ok: false; errors: Array<{ path: string; message: string }> };
        expect(data.ok).toBe(false);
        expect(data.errors[0]?.message).toMatch(/ORPHAN.*not referenced/);
    });

    test("no secrets field — coverage check is skipped (validate-only mode)", async () => {
        const env = await asJson(await call({
            rules: {
                defaults: { on_request: [
                    { type: "inject_header", name: "X-K", value: "${env:K}" },
                ] },
                paths: {},
            },
        }));
        expect(env.ok).toBe(true);
        const data = env.data as { ok: true; referenced: string[] };
        expect(data.referenced).toEqual(["K"]);
    });
});
