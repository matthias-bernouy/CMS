import { describe, expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/cms-content";
import { digestContentRevision, generateStyleEntry } from "@bernouy/cms-content/rendering";
import { serveThemeStyle } from "@bernouy/cms-content/http";
import { InMemoryCache } from "@bernouy/http-runner";

describe("serveThemeStyle", () => {
    test("serves only the current rendering revision and exact generated representation", async () => {
        const content = {
            getContentRevision: async () => 7,
            getRenderingRevision: async () => "7:3",
            getRenderingSettings: async () => defaultSystem(),
        };
        const revision = await digestContentRevision("7:3");
        const cache = new InMemoryCache();
        const generated = await generateStyleEntry(content);
        const first = await serveThemeStyle(request(revision, "0000000000"), {
            content,
            cache,
            resolveContributedAssets: async (input) => input,
        });
        expect(first.status).toBe(404);

        const key = `style:main:rendering:${revision}`;
        expect(cache.get(key)).toBeNull();

        const current = await serveThemeStyle(request(revision, generated.hash), {
            content,
            cache,
            resolveContributedAssets: async (input) => input,
        });
        expect(current.status).toBe(200);
        expect(current.headers.get("cache-control")).toContain("immutable");
        expect(cache.get(key)?.hash).toBe(generated.hash);
    });

    test("rejects stale and malformed revision URLs before generation", async () => {
        const options = {
            content: {
                getContentRevision: async () => 2,
                getRenderingSettings: async () => defaultSystem(),
            },
            cache: new InMemoryCache(),
            resolveContributedAssets: async (input: string) => input,
        };

        expect((await serveThemeStyle(new Request("http://site/.cms/style"), options)).status).toBe(400);
        expect((await serveThemeStyle(request(await digestContentRevision(1), "0000000000"), options)).status).toBe(
            404,
        );
    });

    test("keeps a previously generated immutable representation readable after the theme changes", async () => {
        let renderingRevision = "7:1";
        const content = {
            getContentRevision: async () => 7,
            getRenderingRevision: async () => renderingRevision,
            getRenderingSettings: async () => defaultSystem(),
        };
        const oldRevision = await digestContentRevision(renderingRevision);
        const generated = await generateStyleEntry(content);
        const options = {
            content,
            cache: new InMemoryCache(),
            resolveContributedAssets: async (input: string) => input,
        };

        expect((await serveThemeStyle(request(oldRevision, generated.hash), options)).status).toBe(200);
        renderingRevision = "7:2";
        expect((await serveThemeStyle(request(oldRevision, generated.hash), options)).status).toBe(200);
    });
});

function request(revision: string, version: string): Request {
    return new Request(`http://site/.cms/style?r=${revision}&v=${version}`);
}
