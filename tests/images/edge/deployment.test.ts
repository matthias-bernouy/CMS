import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

test("Edge image contains only the stateless Edge runtime", async () => {
    const dockerfile = await readFile(resolve(root, "infra/images/edge/Dockerfile"), "utf8");

    expect(dockerfile).toContain('org.opencontainers.image.title="Ulvia Edge"');
    expect(dockerfile).toContain("--filter=@bernouy/cms-edge-server");
    expect(dockerfile).not.toContain("bun run build:browser");
    expect(dockerfile).toContain("USER bun");
    expect(dockerfile).toContain('CMD ["bun", "run", "packages/runtimes/cms-edge-server/src/index.ts"]');
    expect(dockerfile).not.toContain("/var/lib/cms");
    expect(dockerfile).not.toContain("@bernouy/ulvia-provider-server");
    expect(dockerfile).not.toContain("@bernouy/official-repository-server");
});
