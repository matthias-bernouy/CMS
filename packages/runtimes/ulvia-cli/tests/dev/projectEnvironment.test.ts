import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createProjectEnvironment,
    resolveCommandPaths,
    resolveProjectEnvironment,
} from "../../src/runtime/dev/projectEnvironment";
import { resetDevData } from "../../src/commands/devData";

describe("project development environments", () => {
    test("creates an isolated environment and resolves it from descendants", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-project-environment-"));
        const project = join(root, "project");
        const child = join(project, "packages", "site");
        const dataHome = join(root, "data");
        try {
            await mkdir(child, { recursive: true });
            const created = await createProjectEnvironment(project, { XDG_DATA_HOME: dataHome }, join(root, "home"));
            const resolved = await resolveProjectEnvironment(child, { XDG_DATA_HOME: dataHome }, join(root, "home"));

            expect(resolved.projectRoot).toBe(project);
            expect(resolved.environmentId).toBe(created.environmentId);
            expect(resolved.paths.data).toBe(created.paths.data);
            expect(created.paths.data.startsWith(join(dataHome, "ulvia", "environments"))).toBe(true);
            expect(await readFile(join(project, ".ulvia", ".gitignore"), "utf8")).toBe("*\n");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("requires an explicit project association unless ULVIA_DATA_DIR overrides it", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-project-missing-"));
        try {
            await expect(resolveCommandPaths(root, {}, join(root, "home"))).rejects.toThrow(/ulvia dev new/);
            expect(
                (await resolveCommandPaths(root, { ULVIA_DATA_DIR: join(root, "explicit") }, join(root, "home"))).data,
            ).toBe(join(root, "explicit"));
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("supports an explicit advanced data directory and rejects a second association", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-project-custom-"));
        const project = join(root, "project");
        const data = join(root, "custom-data");
        try {
            await mkdir(project);
            const created = await createProjectEnvironment(project, {}, join(root, "home"), data);
            expect(created.paths.data).toBe(data);
            await expect(createProjectEnvironment(project, {}, join(root, "home"))).rejects.toThrow(
                /already associated/,
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("rejects a project association whose data identity was replaced", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-project-identity-"));
        const project = join(root, "project");
        const dataHome = join(root, "data");
        try {
            await mkdir(project);
            const created = await createProjectEnvironment(project, { XDG_DATA_HOME: dataHome }, join(root, "home"));
            await writeFile(
                join(created.paths.data, "environment.json"),
                JSON.stringify({
                    schema: "ulvia.project-environment.v1",
                    environmentId: "00000000-0000-4000-8000-000000000000",
                }),
            );
            await expect(
                resolveProjectEnvironment(project, { XDG_DATA_HOME: dataHome }, join(root, "home")),
            ).rejects.toThrow(/identities do not match/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("allows a newly associated environment to be reset before its first successful start", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-project-early-reset-"));
        const project = join(root, "project");
        try {
            await mkdir(project);
            const created = await createProjectEnvironment(project, {}, join(root, "home"));
            await resetDevData(created.paths);
            expect(await readFile(join(created.paths.data, "environment.json"), "utf8")).toContain(
                created.environmentId,
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
