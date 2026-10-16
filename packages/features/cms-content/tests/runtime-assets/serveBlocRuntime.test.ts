import { describe, expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import { serveBlocRuntime } from "@bernouy/cms-content/http";
import { loadBlocRuntimeEntry } from "@bernouy/cms-content/runtime-assets";

describe("serveBlocRuntime", () => {
    test("serves the Bloc runtime with a stable hashed URL", async () => {
        const cache = new InMemoryCache();
        const current = await serveBlocRuntime(new Request("http://localhost/.cms/assets/bloc-runtime.js"), cache);
        const entry = await loadBlocRuntimeEntry();
        const immutable = await serveBlocRuntime(
            new Request(`http://localhost/.cms/assets/bloc-runtime.js?v=${entry.hash}`),
            cache,
        );

        expect(current.status).toBe(200);
        expect(immutable.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        (window as any).cmsRuntime = {};
        window.eval(await immutable.text());
        expect(typeof (window as any).cmsRuntime.createBlocScope).toBe("function");
        expect(typeof (window as any).cmsRuntime.registerBloc).toBe("function");

        const unknown = await serveBlocRuntime(
            new Request("http://localhost/.cms/assets/bloc-runtime.js?v=unknown"),
            cache,
        );
        expect(unknown.status).toBe(404);
        expect(unknown.headers.get("cache-control")).toBe("no-store");
    });
});
