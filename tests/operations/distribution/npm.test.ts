import { expect, test } from "bun:test";
import { prepareNpmPublication } from "../../../infra/distribution/npm";
import { fileHash } from "../../../infra/distribution/files";
import { distributionFixture } from "./fixture";

test("npm publishes the exact archive and an uncertain successful upload is safe to retry", async () => {
    const f = await distributionFixture("1.2.3-beta.1");
    try {
        let stored = false;
        let attempts = 0;
        const integrity = `sha512-${await fileHash(f.archive, "sha512", "base64")}`;
        const transport = {
            fetch: async () =>
                stored
                    ? Response.json({ name: "@cyaxis/ulvia", version: f.version, dist: { integrity } })
                    : new Response(null, { status: 404 }),
            run: async (args: readonly string[]) => {
                expect(args).toContain(f.archive);
                expect(args).toContain("next");
                stored = true;
                attempts++;
                throw new Error("Connection lost after npm accepted the archive");
            },
        };
        await expect((await prepareNpmPublication(f.archive, f.version, transport))()).rejects.toThrow(
            "Connection lost",
        );
        await (await prepareNpmPublication(f.archive, f.version, transport))();
        expect(attempts).toBe(1);
    } finally {
        await f.close();
    }
});

test.each(["different", "unavailable"])("npm %s refuses before publication", async (mode) => {
    const f = await distributionFixture();
    try {
        let writes = 0;
        await expect(
            prepareNpmPublication(f.archive, f.version, {
                fetch: async () =>
                    mode === "different"
                        ? Response.json({ dist: { integrity: "sha512-other" } })
                        : new Response(null, { status: 503 }),
                run: async () => {
                    writes++;
                },
            }),
        ).rejects.toThrow();
        expect(writes).toBe(0);
    } finally {
        await f.close();
    }
});

test("oversized npm metadata releases the stream and refuses before publication", async () => {
    const f = await distributionFixture();
    try {
        let cancelled = false;
        let writes = 0;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new Uint8Array(1_048_577));
            },
            cancel() {
                cancelled = true;
            },
        });
        await expect(
            prepareNpmPublication(f.archive, f.version, {
                fetch: async () => new Response(body),
                run: async () => {
                    writes++;
                },
            }),
        ).rejects.toThrow("exceeds 1 MiB");
        expect(cancelled).toBe(true);
        expect(writes).toBe(0);
    } finally {
        await f.close();
    }
});
