import { describe, test, expect } from "bun:test";
import { $ } from "bun";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("env secret not committed", () => {
    test(".env must not be tracked in git", async () => {
        const tracked = await $`git ls-files`.cwd(REPO_ROOT).text();
        const hasEnv = tracked.split("\n").some(line => line === ".env");
        expect(hasEnv).toBe(false);
    });

    test(".gitignore must cover .env", async () => {
        const gitignore = await Bun.file(join(REPO_ROOT, ".gitignore")).text().catch(() => "");
        const lines = gitignore.split("\n").map(l => l.trim());
        expect(lines.some(l => l === ".env" || l === ".env*" || l === "*.env")).toBe(true);
    });

    test("JWT_SECRET must not be the weak default", async () => {
        const envFile = await Bun.file(join(REPO_ROOT, ".env")).text().catch(() => "");
        expect(envFile).not.toContain("ma_cle_super_secrete_vrament");
    });
});
