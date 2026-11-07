import { expect, test } from "bun:test";

// Runtime tests cannot prove that schema inference rejects incompatible handlers or mocks.
test("the public authoring API preserves inference and rejects invalid TypeScript definitions", async () => {
    const child = Bun.spawn(
        [process.execPath, "x", "tsc", "--project", `${import.meta.dir}/types/tsconfig.json`, "--pretty", "false"],
        {
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    expect([stdout, stderr].join("\n").trim()).toBe("");
    expect(exitCode).toBe(0);
}, 30_000);
