import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import { defaultInstallationConfig } from "../../../src/runtime/stack/installation";
import { sourceStackRelease } from "../../../src/runtime/stack/releases/local";
import { prepareDeployment, deploymentProject } from "../../../src/runtime/stack/orchestration/deployment/artifacts";
import {
    readDeploymentState,
    localServicesIdentity,
    saveDeploymentState,
    loadLocalServicesState,
} from "../../../src/runtime/stack/orchestration/state";

test("deployment intent is distinct from applied state and exact snapshots survive newer CLI definitions", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-stack-state-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        const release = await sourceStackRelease("1.2.3");
        const images = {
            provider: { component: "provider" as const, version: "1.2.3", digest: `sha256:${"a".repeat(64)}` },
            edge: { component: "edge" as const, version: "1.2.3", digest: `sha256:${"b".repeat(64)}` },
        };
        const target = await prepareDeployment(paths, defaultInstallationConfig(), release, images);
        await saveDeploymentState(paths, null, { kind: "apply", phase: "prepared", target });
        expect(await loadLocalServicesState(paths)).toBeNull();
        expect((await readDeploymentState(paths))?.operation?.target.id).toBe(target.id);
        await saveDeploymentState(paths, target, null);
        expect(await loadLocalServicesState(paths)).toEqual(target);
        const project = await deploymentProject(paths, target);
        expect(project.directory).toContain(target.id);
        expect(await readFile(join(project.directory!, "services.yml"), "utf8")).toBe(release.files["services.yml"]);
        expect(localServicesIdentity(resolveUlviaPaths({ ULVIA_DATA_DIR: `${root}-other` })).projectName).not.toBe(
            target.projectName,
        );
        await writeFile(join(project.directory!, "services.yml"), "changed CLI template");
        await expect(deploymentProject(paths, target)).rejects.toThrow("missing or changed");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("missing required applied/operation state fails without repairing existing launch state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-obsolete-state-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        const original = JSON.stringify({
            schema: "ulvia.local-services-stack.v1",
            ...localServicesIdentity(paths),
            images: {},
            installation: defaultInstallationConfig(),
        });
        await writeFile(join(paths.services, "stack.json"), original, { mode: 0o600 });
        await expect(readDeploymentState(paths)).rejects.toThrow("state is invalid");
        expect(await readFile(join(paths.services, "stack.json"), "utf8")).toBe(original);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
