import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import { defaultInstallationConfig } from "../../../src/runtime/stack/installation";
import { LOCAL_STACK_IMAGES } from "../../../src/runtime/stack/orchestration/release";
import { startLocalServices } from "../../../src/runtime/stack/orchestration/services";
import { localServicesIdentity } from "../../../src/runtime/stack/orchestration/state";

test("service start refuses an implicit upgrade before preparing mutable resources", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-stack-version-fence-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    const installation = defaultInstallationConfig();
    const identity = localServicesIdentity(paths);
    await ensureUlviaPaths(paths);
    await writeFile(
        join(paths.services, "stack.json"),
        JSON.stringify({
            schema: "ulvia.local-services-stack.v1",
            version: "0.0.1-alpha.2",
            ...identity,
            images: { provider: LOCAL_STACK_IMAGES.provider, repository: LOCAL_STACK_IMAGES.repository },
            installation,
        }),
    );
    let prepared = false;
    try {
        await expect(
            startLocalServices(paths, installation, () => undefined, {
                prepare: async () => {
                    prepared = true;
                },
            }),
        ).rejects.toThrow(/explicit upgrade/);
        expect(prepared).toBeFalse();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
