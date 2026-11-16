import { expect, test } from "bun:test";
import { mkdtemp, mkdir, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("CLI archive verification isolates and cleans data/config paths even when a personal location is configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-cli-probes-"));
    try {
        await mkdir(join(root, "dist"));
        await writeFile(
            join(root, "dist/index.js"),
            `
import { appendFileSync, mkdirSync } from "node:fs";
const data = process.env.ULVIA_DATA_DIR;
const config = process.env.ULVIA_CONFIG_DIR;
if (!data || !config || data.includes("personal") || config.includes("personal")) { throw new Error("Personal paths inherited"); }
mkdirSync(data, { recursive: true });
mkdirSync(config, { recursive: true });
appendFileSync("audit.jsonl", JSON.stringify({ data, config }) + "\\n");
console.log(process.argv.includes("--version") ? "1.2.3" : "Bundled stack release: 1.2.3");
`,
        );
        const entry = resolve(import.meta.dir, "../../../infra/cli/verification.ts");
        const script = `import { verifyCli } from ${JSON.stringify(entry)}; await verifyCli(${JSON.stringify(root)}, "1.2.3", "1.2.3");`;
        const child = Bun.spawn([process.execPath, "-e", script], {
            env: {
                ...process.env,
                ULVIA_DATA_DIR: join(root, "personal-data"),
                ULVIA_CONFIG_DIR: join(root, "personal-config"),
            },
            stdout: "pipe",
            stderr: "pipe",
        });
        const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
        expect(error).toBe("");
        expect(code).toBe(0);
        const records = (await readFile(join(root, "audit.jsonl"), "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        expect(records).toHaveLength(3);
        expect(new Set(records.map(({ data }) => data)).size).toBe(1);
        for (const { data, config } of records) {
            await expect(lstat(data)).rejects.toMatchObject({ code: "ENOENT" });
            await expect(lstat(config)).rejects.toMatchObject({ code: "ENOENT" });
        }
        await expect(lstat(join(root, "personal-data"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
