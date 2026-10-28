import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function fixture(serial = true) {
    const root = await mkdtemp(join(tmpdir(), "ulvia-console-"));
    for (const dir of [
        "class/tty/console",
        "class/vtconsole/vtcon1",
        "class/vtconsole/vtcon2",
        "bus/pci/drivers/cirrus-qemu/0000:00:02.0",
    ]) {
        await mkdir(join(root, dir), { recursive: true });
    }
    await writeFile(join(root, "class/tty/console/active"), serial ? "tty1 ttyS0" : "tty1");
    for (const [id, name] of [
        ["vtcon1", "(S) dummy device"],
        ["vtcon2", "(M) frame buffer device"],
    ]) {
        await writeFile(join(root, `class/vtconsole/${id}/name`), name!);
        await writeFile(join(root, `class/vtconsole/${id}/bind`), "1\n");
    }
    return root;
}

async function run(root: string) {
    const process = Bun.spawn(["python3", "infra/operations/headless-console.py", "--sysfs", root], {
        stdout: "pipe",
        stderr: "pipe",
    });
    return { status: await process.exited, stderr: await new Response(process.stderr).text() };
}

test("detaches the discovered framebuffer, preserves dummy/serial consoles and is idempotent", async () => {
    const root = await fixture();
    try {
        expect((await run(root)).status).toBe(0);
        expect(await readFile(join(root, "class/vtconsole/vtcon2/bind"), "utf8")).toBe("0\n");
        expect(await readFile(join(root, "class/vtconsole/vtcon1/bind"), "utf8")).toBe("1\n");
        expect((await run(root)).status).toBe(0);
    } finally {
        await rm(root, { recursive: true });
    }
});

test("refuses to detach without a serial console and ignores other graphics drivers", async () => {
    const root = await fixture(false);
    try {
        expect((await run(root)).status).toBe(1);
        expect(await readFile(join(root, "class/vtconsole/vtcon2/bind"), "utf8")).toBe("1\n");
        await writeFile(join(root, "class/tty/console/active"), "tty1 ttyS0");
        await rm(join(root, "bus/pci/drivers/cirrus-qemu"), { recursive: true });
        expect((await run(root)).status).toBe(0);
        expect(await readFile(join(root, "class/vtconsole/vtcon2/bind"), "utf8")).toBe("1\n");
    } finally {
        await rm(root, { recursive: true });
    }
});
