import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateLocalServicesConfig } from "../../../src/runtime/config";

test("obsolete service credentials are rejected without a migration", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-service-credentials-"));
    try {
        await writeFile(
            join(root, "runtime.json"),
            JSON.stringify({
                schema: "ulvia.local-services.v1",
                sessionSecret: "s".repeat(48),
                kekHex: "0".repeat(64),
                mongoUsername: "ulvia",
                mongoPassword: "a".repeat(43),
            }),
        );
        const before = await readFile(join(root, "runtime.json"), "utf8");
        await expect(loadOrCreateLocalServicesConfig(root)).rejects.toThrow("configuration is invalid");
        expect(await readFile(join(root, "runtime.json"), "utf8")).toBe(before);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
