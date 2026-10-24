import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateLocalServicesConfig } from "../../../src/runtime/config";

test("an installed alpha stack gains an isolated Provider Mongo credential", async () => {
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
        const config = await loadOrCreateLocalServicesConfig(root);
        expect(config.schema).toBe("ulvia.services.v2");
        expect(config.mongoProviderUsername).toBe("ulvia_provider");
        expect(config.mongoProviderPassword).toHaveLength(43);
        expect(config.mongoProviderPassword).not.toBe(config.mongoPassword);
        expect(JSON.parse(await readFile(join(root, "runtime.json"), "utf8"))).toEqual(config);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
