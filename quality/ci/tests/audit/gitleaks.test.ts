import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("secret baseline contains only the audited historical fingerprints", async () => {
    const baselinePath = resolve(import.meta.dir, "../../audit/gitleaks-baseline.txt");
    const fingerprints = (await readFile(baselinePath, "utf8"))
        .split(/\r?\n/)
        .filter((line) => line.length > 0 && !line.startsWith("#"));

    expect(fingerprints).toHaveLength(65);
    expect(new Set(fingerprints).size).toBe(65);
    for (const fingerprint of fingerprints) {
        expect(fingerprint).toMatch(/^[0-9a-f]{40}:.+:[a-z0-9-]+:\d+$/);
    }
});
