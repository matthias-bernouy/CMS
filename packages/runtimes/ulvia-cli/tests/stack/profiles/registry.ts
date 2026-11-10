import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Test-only npm peer: run the real CLI downloader without contacting a public registry.
export const registryFixturePath = import.meta.path;
if (process.env.ULVIA_TEST_DOCKER_ROOT) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== "https://registry.npmjs.org") {
            return original(input, init);
        }
        const version = url.pathname
            .split("/")
            .at(-1)!
            .replace(/^ulvia-/u, "")
            .replace(/\.tgz$/u, "");
        const bytes = await readFile(`${process.env.ULVIA_TEST_DOCKER_ROOT}/registry/${version}.tgz`).catch(() => null);
        if (!bytes) {
            return new Response(null, { status: 404 });
        }
        if (url.pathname.endsWith(".tgz")) {
            return new Response(bytes);
        }
        return Response.json({
            name: "@cyaxis/ulvia",
            version,
            dist: {
                tarball: `https://registry.npmjs.org/@cyaxis/ulvia/-/ulvia-${version}.tgz`,
                integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
            },
        });
    }) as typeof fetch;
}
