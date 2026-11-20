import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { publicReader } from "./reader";

test("anonymous transport preserves exact bytes, consumes bodies, reuses connections and never serializes credentials", async () => {
    const calls: { host: string | undefined; cookie: string | undefined }[] = [];
    const server = createServer((request, response) => {
        calls.push({ host: request.headers.host, cookie: request.headers.cookie });
        response.writeHead(200, { "content-type": "text/html", "x-cache": "HIT" });
        response.end("Exact fixture bytes\n");
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Missing loopback listener");
    }
    const origin = `http://site.localhost:${address.port}`;
    const reader = publicReader(origin, `http://127.0.0.1:${address.port}`);
    try {
        const first = await reader.read("/page");
        const second = await reader.read("/page", { cookie: "test-secret" });
        expect(first.status).toBe(200);
        expect(second.hash).toBe(first.hash);
        expect(reader.bodies[first.hash!]).toBe("Exact fixture bytes\n");
        expect(first.firstByteMs!).toBeGreaterThanOrEqual(first.headersMs!);
        expect(first.totalMs).toBeGreaterThanOrEqual(first.firstByteMs!);
        expect(second.reusedSocket).toBeTrue();
        expect(calls).toEqual([
            { host: new URL(origin).host, cookie: undefined },
            { host: new URL(origin).host, cookie: "test-secret" },
        ]);
        expect(JSON.stringify(second)).not.toContain("test-secret");
        expect(() => reader.read("https://example.com/page")).toThrow("fixture origin");
    } finally {
        reader.close();
        server.closeAllConnections();
        server.close();
    }
});

test("transport refuses external endpoints and retains oversized and aborted failures", async () => {
    expect(() => publicReader("https://example.com")).toThrow("loopback");
    const server = createServer((request, response) => {
        if (request.url === "/oversized") {
            response.end(Buffer.alloc(513 * 1024));
        } else {
            response.writeHead(200);
            response.write("partial");
            setTimeout(() => response.destroy(), 5);
        }
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Missing listener");
    }
    const reader = publicReader(`http://localhost:${address.port}`);
    try {
        expect((await reader.read("/oversized")).failure).toBe("response-too-large");
        const aborted = await reader.read("/aborted");
        expect(aborted.failure).not.toBeNull();
        expect(aborted.hash).toBeNull();
        expect(aborted.totalMs).toBeGreaterThan(0);
    } finally {
        reader.close();
        server.closeAllConnections();
        server.close();
    }
});
