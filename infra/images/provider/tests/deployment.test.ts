import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../..");

test("Provider image contains only the stateful Provider runtime", async () => {
    const dockerfile = await readFile(resolve(root, "infra/images/provider/Dockerfile"), "utf8");

    expect(dockerfile).toContain('org.opencontainers.image.title="Ulvia Provider"');
    expect(dockerfile).toContain("--filter=@bernouy/ulvia-provider-server");
    expect(dockerfile).toContain("/var/lib/cms/files");
    expect(dockerfile).toContain('VOLUME ["/var/lib/cms/files"]');
    expect(dockerfile).toContain("USER bun");
    expect(dockerfile).toContain('CMD ["bun", "run", "packages/runtimes/ulvia-provider-server/src/index.ts"]');
    expect(dockerfile).not.toContain("@bernouy/cms-kernel-server");
    expect(dockerfile).not.toContain("@bernouy/official-repository-server");
});
