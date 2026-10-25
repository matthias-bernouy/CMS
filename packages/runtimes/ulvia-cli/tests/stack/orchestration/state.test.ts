import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import { defaultInstallationConfig } from "../../../src/runtime/stack/installation";
import type { OfficialImageComponent } from "../../../src/runtime/stack/orchestration/images";
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
        const saved = await saveLocalServicesState(paths, defaultInstallationConfig(), {
            provider: image("provider"),
            repository: image("repository"),
        });
        expect(saved.images.provider.version).toBe("1.2.3");
        expect(saved.projectName).toBe(localServicesIdentity(paths).projectName);
        expect(await loadLocalServicesState(paths)).toEqual(saved);
        expect(localServicesIdentity(resolveUlviaPaths({ ULVIA_DATA_DIR: `${root}-other` })).projectName).not.toBe(
            saved.projectName,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("local state rejects the obsolete tag-only schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-obsolete-stack-state-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        await writeFile(
            join(paths.services, "stack.json"),
            JSON.stringify({
                schema: "ulvia.local-services-stack.v1",
                version: "0.0.1-alpha.8",
                ...localServicesIdentity(paths),
                images: { provider: "ulvia-provider:old", repository: "ulvia-official-repository:old" },
                installation: defaultInstallationConfig(),
            }),
        );
        await expect(loadLocalServicesState(paths)).rejects.toThrow(/state is invalid/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

function image(component: OfficialImageComponent) {
    const version = "1.2.3";
    const digest = `sha256:${component === "provider" ? "a" : "b"}`.padEnd(71, component === "provider" ? "a" : "b");
    return { component, version, digest } as const;
}
