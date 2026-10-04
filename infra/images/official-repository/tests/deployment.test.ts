import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../..");

test("official repository image keeps its production storage and secret boundaries", async () => {
    const dockerfile = await readFile(resolve(root, "infra/images/official-repository/Dockerfile"), "utf8");

    expect(dockerfile).toContain("oven/bun:1.4.2-alpine@sha256:");
    expect(dockerfile).toContain("--filter=@bernouy/official-repository-server");
    expect(dockerfile).toContain("USER bun");
    expect(dockerfile).toContain("ULVIA_REPOSITORY_DIR=/var/lib/ulvia-repository");
    expect(dockerfile).toContain('VOLUME ["/var/lib/ulvia-repository"]');
    expect(dockerfile).toContain("/healthz");
    expect(dockerfile).toContain('CMD ["bun", "run", "packages/runtimes/official-repository-server/src/index.ts"]');
    expect(dockerfile).not.toMatch(/ULVIA_REPOSITORY_TOKEN\s*=/u);
});
