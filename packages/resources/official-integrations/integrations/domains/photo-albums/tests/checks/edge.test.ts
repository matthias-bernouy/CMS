import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handlePhotoAlbumsRequest } from "../../connectors/supabase/functions/cms-photo-albums/handler";
import { pngBytes } from "../fixtures/png";

type DenoEnvironment = {
    delete(name: string): void;
    get(name: string): string | undefined;
    set(name: string, value: string): void;
};

const originalDeno = (globalThis as { Deno?: unknown }).Deno;
const values = new Map<string, string>();
const testEnvironment: DenoEnvironment = {
    delete(name) {
        values.delete(name);
    },
    get(name) {
        return values.get(name);
    },
    set(name, value) {
        values.set(name, value);
    },
};
(globalThis as { Deno?: { env: DenoEnvironment } }).Deno = { env: testEnvironment };

const originalFetch = globalThis.fetch;
const previousEnv = {
    apiKey: testEnvironment.get("CMS_PHOTO_ALBUMS_API_KEY"),
    serviceRole: testEnvironment.get("SUPABASE_SERVICE_ROLE_KEY"),
    url: testEnvironment.get("SUPABASE_URL"),
};

beforeEach(() => {
    testEnvironment.set("CMS_PHOTO_ALBUMS_API_KEY", "cms-photo-test");
    testEnvironment.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
    testEnvironment.set("SUPABASE_URL", "https://project.supabase.test");
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("CMS_PHOTO_ALBUMS_API_KEY", previousEnv.apiKey);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", previousEnv.serviceRole);
    restoreEnv("SUPABASE_URL", previousEnv.url);
});

afterAll(() => {
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
});

describe("photo albums Edge Function", () => {
    test("rejects an invalid CMS key without contacting Supabase", async () => {
        globalThis.fetch = () => {
            throw new Error("Supabase must not be contacted");
        };

        const response = await handlePhotoAlbumsRequest(request("/health", { authorization: "Bearer invalid" }));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid CMS API key" });
    });

    test("accepts the hashed credential fallback without storing plaintext", async () => {
        testEnvironment.delete("CMS_PHOTO_ALBUMS_API_KEY");
        const expectedHash = await sha256("cms-photo-test");
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            expect(new URL(upstream.url).pathname).toBe("/rest/v1/connector_credentials");
            return Response.json([{ secret_hash: expectedHash }]);
        };

        const response = await handlePhotoAlbumsRequest(request("/health"));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });

    test("authorizes an album before parsing or writing an upload", async () => {
        const calls: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            calls.push(new URL(upstream.url).pathname);
            return Response.json({ message: "not_found: album not found" }, { status: 400 });
        };

        const response = await handlePhotoAlbumsRequest(
            new Request("https://edge.test/cms-photo-albums/photos/upload?albumId=404", {
                method: "POST",
                headers: {
                    authorization: "Bearer cms-photo-test",
                    "content-type": "text/plain",
                },
                body: "this body must never be parsed",
            }),
        );

        expect(response.status).toBe(404);
        expect(calls).toEqual(["/rest/v1/rpc/authorize_photo_upload"]);
    });

    test("uploads a probed original only after authorization", async () => {
        const calls: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const path = new URL(upstream.url).pathname;
            calls.push(`${upstream.method} ${path}`);
            if (path.endsWith("/rpc/authorize_photo_upload")) {
                return Response.json({
                    state: "authorized",
                    album_id: 7,
                    replace_photo_id: null,
                });
            }
            if (path.endsWith("/storage/v1/bucket/photo-albums-originals")) {
                return Response.json({ public: false, file_size_limit: 10 * 1024 * 1024 });
            }
            if (path.includes("/storage/v1/object/photo-albums-originals/")) {
                return Response.json({ key: "stored" });
            }
            if (path.endsWith("/rpc/attach_album_photo")) {
                return Response.json({
                    id: 11,
                    album_id: 7,
                    width: 1,
                    height: 1,
                });
            }
            throw new Error(`Unexpected upstream call: ${path}`);
        };

        const body = new FormData();
        body.set("file", new File([pngBytes(1, 1)], "pixel.png", { type: "application/octet-stream" }));
        const response = await handlePhotoAlbumsRequest(
            new Request("https://edge.test/cms-photo-albums/photos/upload?albumId=7", {
                method: "POST",
                headers: { authorization: "Bearer cms-photo-test" },
                body,
            }),
        );

        const payload = await response.json();
        expect(response.status, JSON.stringify(payload)).toBe(200);
        expect(payload).toMatchObject({ id: 11, albumId: 7, width: 1, height: 1 });
        expect(calls.map(callKind)).toEqual(["authorize", "bucket", "storage", "attach"]);
    });

    test("creates the private bucket when Supabase reports its missing bucket as HTTP 400", async () => {
        const calls: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const path = new URL(upstream.url).pathname;
            calls.push(`${upstream.method} ${path}`);
            if (upstream.method === "GET") {
                return Response.json(
                    { statusCode: "404", error: "Bucket not found", message: "Bucket not found" },
                    { status: 400 },
                );
            }
            if (upstream.method === "POST") {
                return Response.json({ name: "photo-albums-originals" });
            }
            throw new Error(`Unexpected upstream call: ${upstream.method} ${path}`);
        };

        const response = await handlePhotoAlbumsRequest(
            new Request("https://edge.test/cms-photo-albums/setup", {
                method: "POST",
                headers: { authorization: "Bearer cms-photo-test" },
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(calls).toEqual(["GET /storage/v1/bucket/photo-albums-originals", "POST /storage/v1/bucket"]);
    });

    test("does not read Storage for an unpublished photo", async () => {
        const calls: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const path = new URL(upstream.url).pathname;
            calls.push(path);
            if (path.endsWith("/rpc/get_public_photo_context")) {
                return Response.json({ state: "not_found" });
            }
            throw new Error("Storage must not be reached");
        };

        const response = await handlePhotoAlbumsRequest(request("/public/photo?id=41"));

        expect(response.status).toBe(404);
        expect(calls).toEqual(["/rest/v1/rpc/get_public_photo_context"]);
    });

    test.each([
        {
            route: "/public/photo?id=41",
            context: "get_public_photo_context",
            cacheControl: "public, max-age=31536000, immutable",
        },
        {
            route: "/photo?id=41",
            context: "get_managed_photo_context",
            cacheControl: "private, no-store",
        },
    ])("serves $context with its declared cache policy", async ({ route, context, cacheControl }) => {
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const path = new URL(upstream.url).pathname;
            if (path.endsWith(`/rpc/${context}`)) {
                return Response.json({
                    state: "ok",
                    photo: {
                        storage_bucket: "photo-albums-originals",
                        storage_path: "albums/7/photo.png",
                        mime_type: "image/png",
                    },
                });
            }
            if (path.includes("/storage/v1/object/photo-albums-originals/")) {
                return new Response(pngBytes(1, 1), {
                    headers: { "content-type": "image/png", etag: '"photo-etag"' },
                });
            }
            throw new Error(`Unexpected upstream call: ${path}`);
        };

        const response = await handlePhotoAlbumsRequest(request(route));

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe(cacheControl);
        expect(response.headers.get("etag")).toBe('"photo-etag"');
    });
});

function request(path: string, headers: HeadersInit = { authorization: "Bearer cms-photo-test" }): Request {
    return new Request(`https://edge.test/cms-photo-albums${path}`, { headers });
}

function callKind(call: string): string {
    if (call.endsWith("/rpc/authorize_photo_upload")) {
        return "authorize";
    }
    if (call.endsWith("/storage/v1/bucket/photo-albums-originals")) {
        return "bucket";
    }
    if (call.includes("/storage/v1/object/photo-albums-originals/")) {
        return "storage";
    }
    return call.endsWith("/rpc/attach_album_photo") ? "attach" : call;
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        testEnvironment.delete(name);
    } else {
        testEnvironment.set(name, value);
    }
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
