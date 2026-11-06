import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import {
    reservePreparationWorkspace,
    commitPreparationWorkspace,
    discardPreparationWorkspace,
} from "cms-repository/repository/authoring/preparations/workspace";

async function seed(root: string, count: number) {
    await mkdir(root, { recursive: true });
    await Promise.all(Array.from({ length: count }, () => mkdir(join(root, crypto.randomUUID()))));
}

async function workspaces(root: string) {
    return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
}

test("independent processes reserve only one remaining preparation slot", async () => {
    const root = await mkdtemp("/tmp/ulvia-preparation-processes-");
    const module = new URL("../../../src/repository/authoring/preparations/workspace.ts", import.meta.url).href;
    const source = `
        import { reservePreparationWorkspace, commitPreparationWorkspace } from ${JSON.stringify(module)};
        await Bun.stdin.text();
        const root = Bun.argv.at(-1);
        try {
            const work = await reservePreparationWorkspace(root);
            await commitPreparationWorkspace(root, work, crypto.randomUUID());
        } catch (error) {
            if (!error.message.includes("limit reached")) { throw error; }
            process.exit(42);
        }`;
    const spawn = () =>
        Bun.spawn([process.execPath, "--no-macros", "-e", source, root], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
        });
    const children: ReturnType<typeof spawn>[] = [];
    try {
        await seed(root, 63);
        for (let i = 0; i < 4; i++) {
            children.push(spawn());
        }
        for (const child of children) {
            child.stdin.end();
        }
        const results = await Promise.all(
            children.map(async (child) => ({
                code: await child.exited,
                errors: await new Response(child.stderr).text(),
            })),
        );
        expect(results.filter(({ code }) => code === 0)).toHaveLength(1);
        expect(results.filter(({ code }) => code === 42)).toHaveLength(3);
        expect(results.every(({ errors }) => errors === "")).toBeTrue();
        expect(await workspaces(root)).toHaveLength(64);
    } finally {
        for (const child of children) {
            child.kill();
        }
        await Promise.all(children.map((child) => child.exited));
        await rm(root, { recursive: true, force: true });
    }
});

test("in-flight work consumes quota without holding the lock during compilation or blocking another instance", async () => {
    const root = await mkdtemp("/tmp/ulvia-preparation-slots-");
    try {
        const first = join(root, "first");
        const second = join(root, "second");
        await seed(first, 63);
        const active = await reservePreparationWorkspace(first);
        await expect(reservePreparationWorkspace(first)).rejects.toThrow("limit reached");
        const isolated = await reservePreparationWorkspace(second);
        await discardPreparationWorkspace(second, isolated);
        await commitPreparationWorkspace(first, active, crypto.randomUUID());
        expect(await workspaces(first)).toHaveLength(64);
        expect(await workspaces(second)).toHaveLength(0);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("expired workspaces free capacity and discarding a reservation permits another attempt", async () => {
    const root = await mkdtemp("/tmp/ulvia-preparation-expiry-");
    try {
        await seed(root, 64);
        const [expired] = await workspaces(root);
        const old = new Date(Date.now() - 8 * 86400_000);
        await utimes(join(root, expired!.name), old, old);
        const work = await reservePreparationWorkspace(root);
        expect(await workspaces(root)).toHaveLength(64);
        await discardPreparationWorkspace(root, work);
        const replacement = await reservePreparationWorkspace(root);
        await commitPreparationWorkspace(root, replacement, crypto.randomUUID());
        expect(await workspaces(root)).toHaveLength(64);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
