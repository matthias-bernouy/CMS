import { describe, expect, test } from "bun:test";
import { DOWNLOAD_DIGEST, mounted, mutableCompatibilityReader, revision } from "./fixtures";

const COMPATIBILITY_PATH = "/api/integrations/compatibility?kind=demo&version=1.0.0";
const PACKAGE_PATH = "/api/integrations/package?kind=demo&version=1.0.0";

describe("public integration compatibility HTTP contract", () => {
    test("serves GET, conditional HEAD and cacheable CORS preflight", async () => {
        const runner = mounted(mutableCompatibilityReader([revision()]).reader);
        const get = await runner.handle(COMPATIBILITY_PATH);
        const etag = get.headers.get("etag");
        const head = await runner.handle(COMPATIBILITY_PATH, { method: "HEAD" });
        const notModified = await runner.handle(COMPATIBILITY_PATH, {
            method: "HEAD",
            headers: { "if-none-match": `W/${etag}` },
        });
        const options = await runner.handle("/api/integrations/compatibility", { method: "OPTIONS" });

        expect(get.status).toBe(200);
        expect(get.headers.get("cache-control")).toBe("public, max-age=60");
        expect(get.headers.get("access-control-allow-origin")).toBe("*");
        expect(get.headers.get("access-control-expose-headers")).toContain("ETag");
        expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
        expect(head.status).toBe(200);
        expect(head.headers.get("etag")).toBe(etag);
        expect(head.headers.get("content-length")).toBe(get.headers.get("content-length"));
        expect(await head.text()).toBe("");
        expect(notModified.status).toBe(304);
        expect(notModified.headers.get("etag")).toBe(etag);
        expect(await notModified.text()).toBe("");
        expect(options.status).toBe(204);
        expect(options.headers.get("access-control-allow-origin")).toBe("*");
        expect(options.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
        expect(options.headers.get("access-control-allow-headers")).toBe("If-None-Match");
    });

    test("changes the history ETag on append without changing the immutable package ETag", async () => {
        const history = mutableCompatibilityReader();
        const runner = mounted(history.reader, true);
        const compatibilityBefore = await runner.handle(COMPATIBILITY_PATH);
        const packageBefore = await runner.handle(PACKAGE_PATH);

        history.append(revision());

        const compatibilityAfter = await runner.handle(COMPATIBILITY_PATH);
        const packageAfter = await runner.handle(PACKAGE_PATH);
        const bodyAfter = await compatibilityAfter.json();

        expect(compatibilityBefore.headers.get("etag")).not.toBe(compatibilityAfter.headers.get("etag"));
        expect(bodyAfter.current.reportId).toBe("revision-1");
        expect(bodyAfter.totalRevisions).toBe(1);
        expect(packageBefore.headers.get("etag")).toBe(`"${DOWNLOAD_DIGEST}"`);
        expect(packageAfter.headers.get("etag")).toBe(packageBefore.headers.get("etag"));
        expect(packageAfter.headers.get("cache-control")).toContain("immutable");
    });
});
