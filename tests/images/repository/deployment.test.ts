import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

test("Repository deployment uses the Provider and an independent Edge without a standalone image or service", async () => {
    const provider = await readFile(resolve(root, "infra/images/provider/Dockerfile"), "utf8");
    const services = await readFile(
        resolve(root, "packages/runtimes/ulvia-cli/src/runtime/stack/orchestration/definitions/services.yml"),
        "utf8",
    );
    expect(provider).toContain("bun run infra/bootstrap.ts");
    expect(provider.indexOf("RUN bun run infra/bootstrap.ts")).toBeLessThan(provider.indexOf("RUN bunx tsc"));
    expect(provider).toContain("--filter=@bernouy/ulvia-provider-server");
    expect(provider).toContain('VOLUME ["/var/lib/cms/files"]');
    expect(provider).toContain("USER bun");
    expect(services).not.toContain("CMS_REPOSITORY_URL:");
    expect(services).toContain("target: /var/lib/cms/files");
    expect(services).not.toContain("OFFICIAL_REPOSITORY_IMAGE");
    expect(services).not.toContain("ULVIA_REPOSITORY_PORT");
    expect(await readdir(resolve(root, "infra/images"))).not.toContain("official-repository");
    expect(await readdir(resolve(root, "packages/runtimes"))).not.toContain("official-repository-server");
});

test("the Edge image prepares its own ignored runtime metadata before typechecking", async () => {
    const edge = await readFile(resolve(root, "infra/images/edge/Dockerfile"), "utf8");
    expect(edge).toContain("COPY infra/bootstrap.ts infra/execution-support.ts ./infra/");
    const preparation = edge.indexOf("RUN bun run infra/bootstrap.ts");
    expect(preparation).toBeGreaterThan(0);
    expect(preparation).toBeLessThan(edge.indexOf("RUN bunx tsc"));
    expect(edge).toContain("/app/packages/runtimes/ulvia-provider-server/dist/bootstrap");
});
