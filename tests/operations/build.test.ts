import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const entry = resolve(import.meta.dir, "../../build.ts");
const workspace = [
    ["bunx", "tsc", "--build"],
    ["bun", "run", "build:browser"],
    ["bun", "run", "generate:official-bootstrap"],
];

async function run(args: string[], failImages = false) {
    const root = await mkdtemp(join(tmpdir(), "ulvia-build-command-"));
    const log = join(root, "commands.log");
    try {
        await mkdir(join(root, "bin"));
        await mkdir(join(root, "packages/features/content"), { recursive: true });
        const stub = `#!/bin/sh
printf '%s\t%s' "$PWD" "\${0##*/}" >> "$ULVIA_TEST_BUILD_LOG"
printf '\t%s' "$@" >> "$ULVIA_TEST_BUILD_LOG"
printf '\n' >> "$ULVIA_TEST_BUILD_LOG"
case "$*" in
    'run images:build '*)
        if [ "$ULVIA_TEST_FAIL_IMAGES" = 1 ]; then
            exit 7
        fi
        ;;
esac
`;
        for (const name of ["bun", "bunx"]) {
            await writeFile(join(root, "bin", name), stub, { mode: 0o755 });
        }
        const child = Bun.spawn([process.execPath, entry, ...args], {
            cwd: root,
            env: {
                ...process.env,
                PATH: `${join(root, "bin")}:${process.env.PATH}`,
                ULVIA_TEST_BUILD_LOG: log,
                ULVIA_TEST_FAIL_IMAGES: failImages ? "1" : "0",
            },
            stdout: "pipe",
            stderr: "pipe",
        });
        const [status, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        const content = await readFile(log, "utf8").catch((error) => {
            if (error.code === "ENOENT") {
                return "";
            }
            throw error;
        });
        const rows = content
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("\t"));
        return { status, stdout, stderr, commands: rows.map((row) => row.slice(1)), browserCwd: rows[1]?.[0], root };
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

test("unversioned builds retain workspace compilation and bootstrap without building distribution artifacts", async () => {
    const result = await run([]);
    expect(result.status).toBe(0);
    expect(result.commands).toEqual(workspace);
    expect(result.browserCwd).toBe(join(result.root, "packages/features/content"));
    expect(result.stdout).toContain("workspace build done");
});

test.each(["1.0.8", "1.0.8-beta.1"])(
    "versioned builds use %s for both images, the CLI and its initial stack",
    async (version) => {
        const result = await run(["--version", version]);
        expect(result.status).toBe(0);
        expect(result.commands).toEqual([
            ...workspace,
            ["bun", "run", "images:build", "--version", version],
            ["bun", "run", "cli:build", "--version", version, "--stack-version", version],
        ]);
        expect(result.stdout).toContain(`Ulvia ${version} build done`);
    },
);

test.each([["--version"], ["--version", "1.0"], ["--version", "1.0.8", "all"], ["--stack-version", "1.0.8"]])(
    "invalid build arguments fail before compilation: %j",
    async (...args) => {
        const result = await run(args);
        expect(result.status).not.toBe(0);
        expect(result.commands).toEqual([]);
        expect(result.stderr).toContain("Usage: bun run build [--version <version>]");
    },
);

test("image failures stop the distribution build before packaging the CLI", async () => {
    const result = await run(["--version", "1.0.8"], true);
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual([...workspace, ["bun", "run", "images:build", "--version", "1.0.8"]]);
    expect(result.stderr).toContain("exited with 7");
});
