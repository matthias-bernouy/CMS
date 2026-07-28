import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { recoverFsIntegrationRegistryCandidates } from "@bernouy/cms-integration-registry/fs";
import { candidateStoreFixture } from "../fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem candidate mutation lock recovery", () => {
    test("fails closed on a live lock and quarantines only an abandoned one", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await fixture.store.get("layout-ready");
        const lock = join(fixture.root, ".registry", "candidates", ".mutation-lock");
        mkdirSync(lock);

        await expect(
            recoverFsIntegrationRegistryCandidates({
                root: fixture.root,
                now: new Date().toISOString(),
                temporaryGraceMs: 60_000,
            }),
        ).rejects.toThrow(/refuses to race/);
        utimesSync(lock, new Date("2026-07-26T09:00:00.000Z"), new Date("2026-07-26T09:00:00.000Z"));
        const recovered = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
            temporaryGraceMs: 60_000,
        });

        expect(recovered.diagnostics.map((entry) => entry.code)).toEqual(["quarantined_lock"]);
        expect(existsSync(lock)).toBeFalse();
    });
});
