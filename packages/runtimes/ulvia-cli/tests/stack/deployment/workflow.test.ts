import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { profileCliFixture } from "../profiles/fixture";

const read = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), "utf8"));
const calls = async (root: string) =>
    (await readFile(join(root, "calls.ndjson"), "utf8").catch(() => ""))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));

test("start cannot initialize, pull or silently consume pending configuration", async () => {
    const f = await profileCliFixture();
    try {
        const missing = await f.run(["start"]);
        expect(missing.exitCode).not.toBe(0);
        expect(missing.stderr).toContain("ulvia apply first");
        expect(await calls(f.root)).toEqual([]);
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const before = await read(f.root, "data/services/stack.json");
        const ids = await read(f.root, "containers.json");
        expect((await f.run(["configure", "--edges", "3"])).exitCode).toBe(0);
        const offset = (await calls(f.root)).length;
        expect((await f.run(["stop"])).exitCode).toBe(0);
        expect((await f.run(["start"])).exitCode).toBe(0);
        expect(await read(f.root, "data/services/stack.json")).toEqual(before);
        expect(await read(f.root, "containers.json")).toEqual(ids);
        const observed = (await calls(f.root)).slice(offset);
        expect(observed.some(({ args }) => args.includes("up") || args.includes("pull") || args.includes("run"))).toBe(
            false,
        );
        const status = await f.run(["status"]);
        expect(status.stdout).toContain("changes pending");
        expect(status.stdout).toContain("1 running → 3 configured");
        const upgrade = await f.run(["upgrade", "--version", "0.2.0"]);
        expect(upgrade.exitCode).not.toBe(0);
        expect(upgrade.stderr).toContain("Run ulvia apply before upgrading");
        expect((await f.run(["apply"])).exitCode).toBe(0);
        expect((await read(f.root, "data/services/stack.json")).applied.installation.hosting.edgeCount).toBe(3);
        const after = (await calls(f.root)).length;
        expect((await f.run(["apply"])).stdout).toContain("already applied");
        expect((await calls(f.root)).slice(after).some(({ args }) => args.includes("up"))).toBe(false);
    } finally {
        await f.close();
    }
});

test("missing containers require apply; a corrupt recorded snapshot refuses without repair", async () => {
    const f = await profileCliFixture();
    try {
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const before = await read(f.root, "data/services/stack.json");
        const containers = await read(f.root, "containers.json");
        delete containers["edge-1"];
        await writeFile(join(f.root, "containers.json"), JSON.stringify(containers));
        const start = await f.run(["start"]);
        expect(start.exitCode).not.toBe(0);
        expect(start.stderr).toContain("ulvia apply");
        expect((await f.run(["apply"])).exitCode).toBe(0);
        const applied = (await read(f.root, "data/services/stack.json")).applied;
        expect(applied).toEqual(before.applied);
        const snapshot = join(f.root, "data/services/deployments", applied.id, "services.yml");
        await writeFile(snapshot, "tampered");
        const refused = await f.run(["start"]);
        expect(refused.exitCode).not.toBe(0);
        expect(refused.stderr).toContain("missing or changed");
        expect(await readFile(snapshot, "utf8")).toBe("tampered");
        expect((await read(f.root, "data/services/stack.json")).applied).toEqual(applied);
    } finally {
        await f.close();
    }
});

test("failed upgrades retain applied truth, refuse start/configuration changes and resume their exact target", async () => {
    const f = await profileCliFixture();
    try {
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        const previous = await read(f.root, "data/services/stack.json");
        const failed = await f.run(["upgrade", "--version", "0.2.0"], {
            ULVIA_TEST_DOCKER_FAIL_VERSION: "0.2.0",
            ULVIA_TEST_DOCKER_FAIL_COMPONENT: "edge",
        });
        expect(failed.exitCode).not.toBe(0);
        const pending = await read(f.root, "data/services/stack.json");
        expect(pending.applied).toEqual(previous.applied);
        expect(pending.operation.target.release.version).toBe("0.2.0");
        expect(pending.operation.phase).toBe("failed");
        expect((await f.run(["start"])).stderr).toContain("ulvia upgrade");
        expect((await f.run(["configure", "--edges", "3"])).exitCode).not.toBe(0);
        expect((await f.run(["apply"])).exitCode).not.toBe(0);
        const status = await f.run(["status"]);
        expect(status.stdout).toContain("Stack release: 0.1.0");
        expect(status.stdout).toContain("upgrade 0.2.0 (failed)");
        expect(status.stdout).toContain("unhealthy");
        expect((await f.run(["upgrade"])).exitCode).toBe(0);
        const recovered = await read(f.root, "data/services/stack.json");
        expect(recovered.operation).toBeNull();
        expect(recovered.applied.id).toBe(pending.operation.target.id);
        expect(recovered.applied.images.provider.version).toBe("0.2.0");
        expect(recovered.applied.images.edge.version).toBe("0.2.0");
    } finally {
        await f.close();
    }
});
