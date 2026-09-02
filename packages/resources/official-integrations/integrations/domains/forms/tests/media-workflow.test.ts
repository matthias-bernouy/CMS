import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleFormsRequest } from "../connectors/supabase/functions/cms-forms/handler";

const realFetch = globalThis.fetch;
const adminHeaders = {
    authorization: "Bearer cms_forms_test",
    "x-cms-user-id": "admin-1",
    "x-cms-user-role": "admin",
};

beforeEach(() => {
    Object.defineProperty(globalThis, "Deno", {
        configurable: true,
        value: {
            env: {
                get(name: string) {
                    return {
                        CMS_FORMS_API_KEY: "cms_forms_test",
                        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
                        SUPABASE_URL: "https://database.example.test",
                    }[name];
                },
            },
        },
    });
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("/storage/v1/object/forms-media/")) {
            return init?.method === "GET"
                ? new Response(formImageBytes(), { headers: { "content-type": "image/png" } })
                : new Response(null, { status: 200 });
        }
        if (url.endsWith("/rpc/create_media")) {
            return json({
                mediaId: 101,
                mimeType: "image/png",
                fileSize: formImageBytes().byteLength,
                width: 1,
                height: 1,
                originalFilename: "inside.png",
            });
        }
        if (url.endsWith("/rpc/get_managed_media_context") || url.endsWith("/rpc/get_published_media_context")) {
            return json({
                mediaId: 101,
                storageBucket: "forms-media",
                storagePath: "forms/restaurant-onboarding/2026-09-01/image.png",
                mimeType: "image/png",
            });
        }
        return json({ message: `unexpected request: ${url}` }, 500);
    };
});

afterEach(() => {
    globalThis.fetch = realFetch;
    Reflect.deleteProperty(globalThis, "Deno");
});

describe("Forms private media workflow", () => {
    test("uploads and streams an image through controlled endpoints", async () => {
        const data = new FormData();
        data.set("file", new File([formImageBytes()], "inside.png", { type: "image/png" }));
        const upload = await handleFormsRequest(
            new Request("https://cms.example.test/cms-forms/admin/form/image?ref=restaurant-onboarding", {
                method: "POST",
                headers: adminHeaders,
                body: data,
            }),
        );
        expect(upload.status).toBe(200);
        expect(await upload.json()).toMatchObject({ ok: true, mediaId: 101, width: 1, height: 1 });

        const managed = await handleFormsRequest(request("/admin/form/image?id=101"));
        expect(managed.status).toBe(200);
        expect(managed.headers.get("content-type")).toBe("image/png");
        expect(new Uint8Array(await managed.arrayBuffer())).toEqual(formImageBytes());

        const published = await handleFormsRequest(
            request("/public/form/image?key=restaurant-onboarding&version=1&id=101"),
        );
        expect(published.status).toBe(200);
        expect(published.headers.get("cache-control")).toBe("private, no-store");
    });
});

function request(path: string): Request {
    return new Request(`https://cms.example.test/cms-forms${path}`, { headers: adminHeaders });
}

function json(value: unknown, status = 200): Response {
    return Response.json(value, { status });
}

function formImageBytes(): Uint8Array {
    return new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ]);
}
