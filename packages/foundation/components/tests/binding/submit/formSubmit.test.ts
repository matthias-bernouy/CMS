import { afterEach, describe, expect, test } from "bun:test";
import { collectFormData, serializeForm, submitForm } from "../../../src/binding/submit/formSubmit";
import { resetDom } from "../testUtils";

afterEach(resetDom);

function form(html: string): HTMLFormElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    document.body.append(host);
    return host.querySelector("form")!;
}

describe("formSubmit", () => {
    test("serializes non-GET forms as flat JSON with repeated names as arrays", () => {
        const target = form(`
            <form>
                <input name="title" value="Hello">
                <input name="tags" value="a">
                <input name="tags" value="b">
            </form>
        `);

        const serialized = serializeForm(target, { url: "/api/posts", method: "POST" });

        expect(serialized.kind).toBe("json");
        expect(serialized.data).toEqual({ title: "Hello", tags: ["a", "b"] });
        if (serialized.kind === "json") expect(JSON.parse(serialized.body)).toEqual(serialized.data);
    });

    test("serializes GET forms into the query string", () => {
        const target = form(`
            <form>
                <input name="q" value="plans">
                <input name="limit" value="5">
            </form>
        `);

        const serialized = serializeForm(target, { url: "/api/search?kind=public", method: "GET" });

        expect(serialized.kind).toBe("query");
        expect(serialized.url).toBe("http://localhost/api/search?kind=public&q=plans&limit=5");
    });

    test("uses FormData when a file is present", () => {
        const target = form(`<form><input type="file" name="photos" multiple></form>`);
        const input = target.querySelector<HTMLInputElement>("input")!;
        Object.defineProperty(input, "files", {
            value: [
                new File(["a"], "a.jpg", { type: "image/jpeg" }),
                new File(["b"], "b.jpg", { type: "image/jpeg" }),
            ],
        });

        const serialized = serializeForm(target, { url: "/api/upload", method: "POST" });

        expect(serialized.kind).toBe("formData");
        expect(Array.from(serialized.formData.getAll("photos")).map(file => (file as File).name)).toEqual(["a.jpg", "b.jpg"]);
    });

    test("submitForm returns a normalized result and never throws for network failures", async () => {
        const target = form(`<form><input name="email" value="ada@example.com"></form>`);
        let requestBody = "";
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
            requestBody = String(init?.body);
            return new Response(JSON.stringify({ ok: true }), {
                status: 201,
                statusText: "Created",
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const result = await submitForm(target, { url: "/api/users", method: "POST" });

        expect(requestBody).toBe(JSON.stringify({ email: "ada@example.com" }));
        expect(result).toMatchObject({ ok: true, status: 201, statusText: "Created", body: { ok: true }, message: "" });

        globalThis.fetch = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
        const failed = await submitForm(target, { url: "/api/users", method: "POST" });
        expect(failed).toMatchObject({ ok: false, status: 0, statusText: "Network Error", message: "offline" });
    });

    test("fallback collection reads light DOM controls when native FormData is empty", () => {
        const target = form(`<form><input name="q" value="fallback"></form>`);
        const NativeFormData = globalThis.FormData;
        class EmptyFormData extends NativeFormData {
            constructor() { super(); }
        }
        globalThis.FormData = EmptyFormData as typeof FormData;
        try {
            expect(Array.from(collectFormData(target).entries())).toEqual([["q", "fallback"]]);
        } finally {
            globalThis.FormData = NativeFormData;
        }
    });
});
