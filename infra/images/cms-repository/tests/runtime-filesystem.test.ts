import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

const imageRoot = resolve(import.meta.dir, "..");
const dockerfile = readFileSync(resolve(imageRoot, "Dockerfile"), "utf8");
const runtimeBase = dockerfile.match(/^FROM\s+(\S+)\s+AS\s+runtime$/m)?.[1];
const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const dockerAvailable = commandSucceeds(["docker", "version"]);
const runtimeBaseAvailable = runtimeBase ? commandSucceeds(["docker", "image", "inspect", runtimeBase]) : false;
const dockerSmoke = dockerAvailable && runtimeBaseAvailable ? test : test.skip;

dockerSmoke("runtime uid can write only to the registry bind and bounded noexec tmpfs", async () => {
    if (!runtimeBase) {
        throw new Error("Repository Dockerfile runtime base was not found");
    }
    const root = await mkdtemp(join(tmpdir(), "cms-repository-filesystem-"));
    roots.push(root);
    const registry = join(root, "registry");
    await mkdir(registry, { mode: 0o750 });

    const probe = Bun.spawnSync({
        cmd: [
            "docker",
            "run",
            "--rm",
            "--read-only",
            "--user",
            "1000:1000",
            "--mount",
            `type=bind,source=${registry},target=/var/lib/cms-repository/registry`,
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1770,uid=1000,gid=1000",
            runtimeBase,
            "sh",
            "-c",
            filesystemProbe,
        ],
        stdout: "pipe",
        stderr: "pipe",
    });

    expect(probe.exitCode, probe.stderr.toString()).toBe(0);
    expect(await readFile(join(registry, "write-probe"), "utf8")).toBe("registry-ok");
});

const filesystemProbe = `
set -eu
test "$(id -u):$(id -g)" = "1000:1000"
printf registry-ok > /var/lib/cms-repository/registry/write-probe
printf tmp-ok > /tmp/write-probe
if touch /home/bun/rootfs-write-probe 2>/dev/null; then exit 21; fi
printf '#!/bin/sh\nexit 0\n' > /tmp/noexec-probe
chmod 0700 /tmp/noexec-probe
if /tmp/noexec-probe 2>/dev/null; then exit 22; fi
`;

function commandSucceeds(command: string[]): boolean {
    return (
        Bun.spawnSync({
            cmd: command,
            env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" },
            stdout: "ignore",
            stderr: "ignore",
        }).exitCode === 0
    );
}
