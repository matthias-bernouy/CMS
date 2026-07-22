import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsFunctionRepository } from "cms-cli/dev-server/stores/functions";
import type { CmsFunction } from "@bernouy/cms-functions";

describe("LocalFsFunctionRepository", () => {
    test("persists functions across repository instances", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-functions-"));
        const first = new LocalFsFunctionRepository(siteDir);

        await first.createFunction(testFunction("updateMyProduct"));

        const second = new LocalFsFunctionRepository(siteDir);
        expect(await second.getFunction("updateMyProduct")).toEqual(testFunction("updateMyProduct"));
        expect(await second.getAllFunctions()).toEqual([testFunction("updateMyProduct")]);
    });

    test("updates and deletes generated function artifacts", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-functions-"));
        const repo = new LocalFsFunctionRepository(siteDir);
        await repo.createFunction(testFunction("updateMyProduct"));

        await repo.updateFunction({ ...testFunction("updateMyProduct"), method: "PUT" });

        const file = join(siteDir, ".p9r", "generated", "functions", "updateMyProduct.json");
        const stored = JSON.parse(await readFile(file, "utf-8")) as CmsFunction;
        expect(stored.method).toBe("PUT");
        expect(await repo.deleteFunction("updateMyProduct")).toBe(true);
        expect(existsSync(file)).toBe(false);
        expect(await repo.getFunction("updateMyProduct")).toBeNull();
    });
});

function testFunction(id: string): CmsFunction {
    return {
        id,
        method: "POST",
        steps: [],
        return: { status: 200, body: { ok: true } },
    };
}
