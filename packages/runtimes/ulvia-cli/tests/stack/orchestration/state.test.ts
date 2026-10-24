import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import { defaultInstallationConfig } from "../../../src/runtime/stack/installation";
import { LOCAL_STACK_VERSION } from "../../../src/runtime/stack/orchestration/release";
import {
    loadLocalServicesState,
    localServicesIdentity,
    saveLocalServicesState,
} from "../../../src/runtime/stack/orchestration/state";

test("local service identity is stable for one user data directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-stack-state-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        const saved = await saveLocalServicesState(paths, defaultInstallationConfig());
        expect(saved.version).toBe(LOCAL_STACK_VERSION);
        expect(saved.projectName).toBe(localServicesIdentity(paths).projectName);
        expect(await loadLocalServicesState(paths)).toEqual(saved);
        expect(localServicesIdentity(resolveUlviaPaths({ ULVIA_DATA_DIR: `${root}-other` })).projectName).not.toBe(
            saved.projectName,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
