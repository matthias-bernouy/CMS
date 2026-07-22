import { afterEach, describe, expect, test } from "bun:test";
import { serializeForm, submitForm } from "../../../src/binding/submit/formSubmit";
import { resetDom } from "../testUtils";
import { form } from "./formTestUtils";

afterEach(resetDom);

describe("formSubmit serialization", () => {
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
        if (serialized.kind === "json") {
            expect(JSON.parse(serialized.body)).toEqual(serialized.data);
        }
    });

    test("adds body fields to non-GET JSON without replacing real controls", () => {
        const target = form(`<form><input name="email" value="ada@example.com"></form>`);
        const serialized = serializeForm(target, {
            url: "/api/users",
            method: "POST",
            bodyFields: { email: "bound@example.com", source: "signup", active: true, count: 2 },
        });
        expect(serialized.kind).toBe("json");
        expect(serialized.data).toEqual({
            email: "ada@example.com",
            source: "signup",
            active: true,
            count: 2,
        });
        if (serialized.kind === "json") {
            expect(JSON.parse(serialized.body)).toEqual(serialized.data);
        }
    });

    test("serializes GET forms into the query string", () => {
        const target = form(`<form><input name="q" value="plans"><input name="limit" value="5"></form>`);
        const serialized = serializeForm(target, { url: "/api/search?kind=public", method: "GET" });
        expect(serialized.kind).toBe("query");
        expect(serialized.url).toBe("http://localhost/api/search?kind=public&q=plans&limit=5");
    });

    test("ignores body fields for GET forms", () => {
        const target = form(`<form><input name="q" value="plans"></form>`);
        const serialized = serializeForm(target, {
            url: "/api/search",
            method: "GET",
            bodyFields: { hidden: "ignored" },
        });
        expect(serialized.kind).toBe("query");
        expect(serialized.url).toBe("http://localhost/api/search?q=plans");
        expect(serialized.data).toEqual({ q: "plans" });
    });

    test("uses FormData when a file is present", () => {
        const target = form(`<form><input type="file" name="photos" multiple></form>`);
        Object.defineProperty(target.querySelector("input")!, "files", {
            value: [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })],
        });
        const serialized = serializeForm(target, { url: "/api/upload", method: "POST" });
        expect(serialized.kind).toBe("formData");
        expect(Array.from(serialized.formData.getAll("photos")).map((file) => (file as File).name)).toEqual([
            "a.jpg",
            "b.jpg",
        ]);
    });

    test("adds body fields to multipart FormData", () => {
        const target = form(`<form><input type="file" name="photo"></form>`);
        Object.defineProperty(target.querySelector("input")!, "files", {
            value: [new File(["a"], "a.jpg", { type: "image/jpeg" })],
        });
        const serialized = serializeForm(target, {
            url: "/api/upload",
            method: "POST",
            bodyFields: { folder: "avatars" },
        });
        expect(serialized.kind).toBe("formData");
        expect(serialized.formData.get("folder")).toBe("avatars");
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

        globalThis.fetch = (async () => {
            throw new Error("offline");
        }) as unknown as typeof fetch;
        const failed = await submitForm(target, { url: "/api/users", method: "POST" });
        expect(failed).toMatchObject({ ok: false, status: 0, statusText: "Network Error", message: "offline" });
    });
});
