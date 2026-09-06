import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { UiAudit } from "../contracts/types";

test("CLI audits imported browser helpers, reports real violations, and fails closed on an empty root", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-contract-cli-"));
    async function write(path: string, content: string): Promise<void> {
        const absolute = join(root, path);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, content);
    }
    async function run() {
        const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../check.ts"), "--root", root, "--json"], {
            stdout: "pipe",
            stderr: "pipe",
        });
        const [code, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        return { code, stdout, stderr };
    }
    try {
        const empty = await run();
        expect(empty.code).toBe(2);
        expect(empty.stderr).toBeTruthy();
        const pkg = "packages/surfaces/cms-control";
        await write(`${pkg}/package.json`, '{"name":"@bernouy/cms-control"}');
        await write(`${pkg}/src/components/View.ts`, 'import { load } from "cms-control/core/data"; load();');
        await write(`${pkg}/src/core/data.ts`, 'export const load = () => fetch("/api/items");');
        await write(`${pkg}/src/core/server.ts`, 'fetch("https://provider.test");');
        const template = `${pkg}/src/components/view.html`;
        await write(template, '<cms-binding-core><div cms-source="/api/items"></div></cms-binding-core>');
        const blocked = await run();
        expect(blocked.code).toBe(1);
        const audit = JSON.parse(blocked.stdout) as UiAudit;
        expect(audit.findings.map(({ severity }) => severity).sort()).toEqual(["ERROR", "WARNING"]);
        expect(audit.findings.find(({ severity }) => severity === "WARNING")?.file).toEndWith("/core/data.ts");
        await write(template, '<div cms-source="/api/items"></div>');
        const advisory = await run();
        expect(advisory.code).toBe(0);
        expect((JSON.parse(advisory.stdout) as UiAudit).findings).toHaveLength(1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
