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

    test("adds body fields to non-GET JSON without replacing real controls", () => {
        const target = form(`
            <form>
                <input name="email" value="ada@example.com">
            </form>
        `);

        const serialized = serializeForm(target, {
            url: "/api/users",
            method: "POST",
            bodyFields: {
                email: "bound@example.com",
                source: "signup",
                active: true,
                count: 2,
            },
        });

        expect(serialized.kind).toBe("json");
        expect(serialized.data).toEqual({
            email: "ada@example.com",
            source: "signup",
            active: true,
            count: 2,
        });
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

    test("adds body fields to multipart FormData", () => {
        const target = form(`<form><input type="file" name="photo"></form>`);
        const input = target.querySelector<HTMLInputElement>("input")!;
        Object.defineProperty(input, "files", {
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

    test("fallback collection reads files exposed by form-associated controls", () => {
        const target = document.createElement("form");
        const control = document.createElement("upload-control") as HTMLElement & {
            name: string;
            files: File[];
        };
        control.setAttribute("name", "file");
        control.name = "file";
        control.files = [new File(["avatar"], "avatar.png", { type: "image/png" })];
        target.append(control);
        const NativeFormData = globalThis.FormData;
        class EmptyFormData extends NativeFormData {
            constructor() { super(); }
        }
        globalThis.FormData = EmptyFormData as typeof FormData;
        try {
            const entries = Array.from(collectFormData(target).entries());
            expect(entries).toHaveLength(1);
            expect(entries[0]?.[0]).toBe("file");
            const file: unknown = entries[0]?.[1];
            expect(file).toBeInstanceOf(File);
            if (!(file instanceof File)) throw new Error("expected file entry");
            expect(file.name).toBe("avatar.png");
        } finally {
            globalThis.FormData = NativeFormData;
        }
    });

    test("fallback collection preserves repeated values exposed by a custom control", () => {
        const target = form(`<form><choice-group name="styles"></choice-group></form>`);
        const control = target.querySelector("choice-group") as HTMLElement & { name: string; value: string[] };
        control.name = "styles";
        control.value = ["attacking", "defensive"];
        const NativeFormData = globalThis.FormData;
        class EmptyFormData extends NativeFormData {
            constructor() { super(); }
        }
        globalThis.FormData = EmptyFormData as typeof FormData;
        try {
            expect(Array.from(collectFormData(target).entries())).toEqual([
                ["styles", "attacking"],
                ["styles", "defensive"],
            ]);
        } finally {
            globalThis.FormData = NativeFormData;
        }
    });

    test("fallback collection serializes an explicit unchecked custom-control value", () => {
        const target = form(`<form><toggle-control name="notifications"></toggle-control></form>`);
        const control = target.querySelector("toggle-control") as HTMLElement & {
            name: string;
            value: string;
            checked: boolean;
            uncheckedValue: string;
        };
        control.name = "notifications";
        control.value = "true";
        control.checked = false;
        control.uncheckedValue = "false";
        const NativeFormData = globalThis.FormData;
        class EmptyFormData extends NativeFormData {
            constructor() { super(); }
        }
        globalThis.FormData = EmptyFormData as typeof FormData;
        try {
            expect(Array.from(collectFormData(target).entries())).toEqual([["notifications", "false"]]);
        } finally {
            globalThis.FormData = NativeFormData;
        }
    });
});
