import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

test("Kernel image contains only the stateless Kernel runtime", async () => {
    const dockerfile = await readFile(resolve(root, "infra/images/kernel/Dockerfile"), "utf8");

    expect(dockerfile).toContain('org.opencontainers.image.title="Ulvia Kernel"');
    expect(dockerfile).toContain("--filter=@bernouy/cms-kernel-server");
    expect(dockerfile).toContain("packages/features/cms-content");
    expect(dockerfile).toContain("USER bun");
    expect(dockerfile).toContain('CMD ["bun", "run", "packages/runtimes/cms-kernel-server/src/index.ts"]');
    expect(dockerfile).not.toContain("/var/lib/cms");
    expect(dockerfile).not.toContain("@bernouy/ulvia-provider-server");
    expect(dockerfile).not.toContain("@bernouy/official-repository-server");
});
