import { describe, expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import { serveComponentRuntime } from "@bernouy/cms-content/http";
import { loadComponentRuntimeEntry } from "@bernouy/cms-content/runtime-assets";

describe("serveComponentRuntime", () => {
    test("serves the component bundle with a stable hashed URL", async () => {
        const cache = new InMemoryCache();
        const current = await serveComponentRuntime(new Request("http://localhost/.cms/assets/component.js"), cache);
        const entry = await loadComponentRuntimeEntry();
        const immutable = await serveComponentRuntime(
            new Request(`http://localhost/.cms/assets/component.js?v=${entry.hash}`),
            cache,
        );

        expect(current.status).toBe(200);
        expect(immutable.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        (window as any).cmsRuntime = {};
        window.eval(await immutable.text());
        expect(typeof (window as any).cmsRuntime.Component).toBe("function");

        const unknown = await serveComponentRuntime(
            new Request("http://localhost/.cms/assets/component.js?v=unknown"),
            cache,
        );
        expect(unknown.status).toBe(404);
        expect(unknown.headers.get("cache-control")).toBe("no-store");
    });
});
