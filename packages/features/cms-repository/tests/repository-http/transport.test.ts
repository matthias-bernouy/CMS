import { expect, test } from "bun:test";
import { repositoryBaseUrl } from "../../src/repository-http/baseUrl";
import { getRepositoryBytes, MAX_REPOSITORY_RESPONSE_BYTES } from "../../src/repository-http/getBytes";

test("repository transport rejects redirects and oversized responses", async () => {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            const path = new URL(request.url).pathname;
            if (path === "/redirect") {
                return Response.redirect(new URL("/small", request.url));
            }
            return new Response(new Uint8Array(path === "/large" ? MAX_REPOSITORY_RESPONSE_BYTES + 1 : 2));
        },
    });
    try {
        const base = repositoryBaseUrl(`http://127.0.0.1:${server.port}`, "Collection");
        expect(await getRepositoryBytes(base, "small", "Collection")).toEqual(new Uint8Array(2));
        await expect(getRepositoryBytes(base, "redirect", "Collection")).rejects.toThrow();
        await expect(getRepositoryBytes(base, "large", "Collection")).rejects.toThrow("response too large");
    } finally {
        server.stop(true);
    }
});

test("repository base URLs reject credentials and non-HTTPS remote hosts", () => {
    expect(() => repositoryBaseUrl("http://example.com", "Provider")).toThrow("HTTPS or loopback HTTP");
    expect(() => repositoryBaseUrl("https://user:pass@example.com", "Provider")).toThrow("URL credentials");
});
