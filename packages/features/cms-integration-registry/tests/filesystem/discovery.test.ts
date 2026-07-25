import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import { writeIntegrationFixture } from "./fixtures";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("bounded integration registry discovery", () => {
    test("stops directory iteration at the configured entry limit", async () => {
        const root = registryRoot();
        for (let index = 0; index < 4; index += 1) {
            writeFileSync(join(root, `entry-${index}`), "ignored");
        }

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({
            root,
            catalogLimits: { maxEntriesPerDirectory: 3 },
        });

        expect(snapshot.summaries).toEqual([]);
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-structure",
                stage: "discovery",
                source: root,
                message: expect.stringContaining("more than 3 entries"),
            }),
        ]);
    });

    test("ignores every reserved internal directory explicitly", async () => {
        const root = registryRoot();
        writeIntegrationFixture(root, "demo");
        for (const name of [".registry", ".staging", ".quarantine", ".locks", ".journals"]) {
            const reserved = join(root, name);
            mkdirSync(reserved);
            writeFileSync(join(reserved, "integration.json"), "{ invalid and intentionally ignored");
        }

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({
            root,
            catalogLimits: { maxEntriesPerDirectory: 2 },
        });

        expect(snapshot.summaries.map((entry) => entry.kind)).toEqual(["demo"]);
        expect(snapshot.diagnostics).toEqual([]);
    });
});

function registryRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-discovery-"));
    roots.push(root);
    return root;
}
