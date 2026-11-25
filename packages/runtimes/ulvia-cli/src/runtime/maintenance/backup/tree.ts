/** Self-contained trusted worker, executed in an isolated container to read Mongo-owned files. */
export async function backupTree(input: {
    mode: "create" | "verify" | "restore";
    data: string;
    backup: string;
    uid: number;
    gid: number;
}) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const crypto = await import("node:crypto");
    type Entry = {
        path: string;
        kind: "file" | "directory";
        uid: number;
        gid: number;
        mode: number;
        bytes: number;
        hash?: string;
    };
    const excluded = new Set([
        ".write-lock",
        "repository/.write-lock",
        ".maintenance.json",
        "services/credentials/maintenance.json",
    ]);
    const payload = path.join(input.backup, "payload");
    const index = path.join(input.backup, "tree.json");
    const safe = (name: string) => {
        if (
            !name ||
            name.length > 4096 ||
            name.includes("\\") ||
            name.includes("\0") ||
            name.split("/").some((p) => !p || p === "." || p === "..")
        ) {
            throw Error("Invalid backup member path");
        }
    };
    async function digest(file: string) {
        const handle = await fs.open(file, "r");
        const hash = crypto.createHash("sha256"),
            chunk = Buffer.alloc(1024 * 1024);
        try {
            for (;;) {
                const read = await handle.read(chunk);
                if (!read.bytesRead) {
                    break;
                }
                hash.update(chunk.subarray(0, read.bytesRead));
            }
        } finally {
            await handle.close();
        }
        return hash.digest("hex");
    }
    async function sync(file: string) {
        const h = await fs.open(file, "r");
        try {
            await h.sync();
        } finally {
            await h.close();
        }
    }
    async function privateEntry(file: string, directory: boolean) {
        await fs.chmod(file, directory ? 0o700 : 0o600);
        await fs.chown(file, input.uid, input.gid);
    }
    async function scan(root: string, exclude: boolean) {
        const entries: Entry[] = [];
        async function visit(relative: string) {
            for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
                if (exclude && excluded.has(relative ? `${relative}/${name}` : name)) {
                    continue;
                }
                const member = relative ? `${relative}/${name}` : name;
                safe(member);
                const stat = await fs.lstat(path.join(root, member));
                if (
                    stat.isSymbolicLink() ||
                    (!stat.isFile() && !stat.isDirectory()) ||
                    (stat.isFile() && stat.nlink !== 1)
                ) {
                    throw Error("Backup contains a link or special file");
                }
                entries.push({
                    path: member,
                    kind: stat.isDirectory() ? "directory" : "file",
                    uid: stat.uid,
                    gid: stat.gid,
                    mode: stat.mode & 0o777,
                    bytes: stat.isFile() ? stat.size : 0,
                });
                if (entries.length > 50000 || stat.size > 2 ** 40) {
                    throw Error("Backup inventory exceeds its bound");
                }
                if (stat.isDirectory()) {
                    await visit(member);
                }
            }
        }
        await visit("");
        return entries;
    }
    if (input.mode === "create") {
        const entries = await scan(input.data, true);
        const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
        const free = await fs.statfs(input.backup);
        if (free.bavail * free.bsize < bytes + Math.max(1024 ** 2, bytes * 0.05)) {
            throw Error("Insufficient backup storage");
        }
        await fs.mkdir(payload, { mode: 0o700 });
        await privateEntry(payload, true);
        for (const entry of entries) {
            const source = path.join(input.data, entry.path),
                target = path.join(payload, entry.path);
            if (entry.kind === "directory") {
                await fs.mkdir(target, { mode: 0o700, recursive: true });
            } else {
                const before = await fs.lstat(source);
                await fs.copyFile(source, target);
                entry.hash = await digest(target);
                const after = await fs.lstat(source);
                if (
                    !after.isFile() ||
                    before.ino !== after.ino ||
                    before.mtimeMs !== after.mtimeMs ||
                    before.ctimeMs !== after.ctimeMs ||
                    (await digest(source)) !== entry.hash
                ) {
                    throw Error("Backup source changed during capture");
                }
                await sync(target);
            }
            await privateEntry(target, entry.kind === "directory");
        }
        for (const entry of entries.toReversed()) {
            if (entry.kind === "directory") {
                await sync(path.join(payload, entry.path));
            }
        }
        const json = JSON.stringify({ schema: "ulvia.backup-tree/v1", entries });
        if (Buffer.byteLength(json) > 64 * 1024 ** 2) {
            throw Error("Backup inventory exceeds its byte bound");
        }
        await fs.writeFile(index, json, { flag: "wx", mode: 0o600 });
        await privateEntry(index, false);
        await sync(index);
        await sync(payload);
        await sync(input.backup);
    }
    const meta = await fs.lstat(index);
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 64 * 1024 ** 2) {
        throw Error("Invalid backup inventory");
    }
    const inventory = JSON.parse(await fs.readFile(index, "utf8"));
    if (
        Object.keys(inventory).sort().join(",") !== "entries,schema" ||
        inventory.schema !== "ulvia.backup-tree/v1" ||
        !Array.isArray(inventory.entries) ||
        inventory.entries.length > 50000
    ) {
        throw Error("Invalid backup inventory");
    }
    const entries: Entry[] = inventory.entries;
    const actual = await scan(payload, false);
    if (actual.length !== entries.length) {
        throw Error("Backup inventory does not match its payload");
    }
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        safe(entry.path);
        const keys = entry.kind === "file" ? "bytes,gid,hash,kind,mode,path,uid" : "bytes,gid,kind,mode,path,uid";
        if (
            Object.keys(entry).sort().join(",") !== keys ||
            !["file", "directory"].includes(entry.kind) ||
            ![entry.uid, entry.gid, entry.bytes, entry.mode].every((n) => Number.isSafeInteger(n) && n >= 0) ||
            entry.uid > 2147483647 ||
            entry.gid > 2147483647 ||
            entry.mode > 0o777 ||
            actual[i]!.path !== entry.path ||
            actual[i]!.kind !== entry.kind ||
            actual[i]!.bytes !== entry.bytes ||
            excluded.has(entry.path)
        ) {
            throw Error("Invalid backup member metadata");
        }
        if (
            entry.kind === "file" &&
            (!/^[a-f0-9]{64}$/u.test(entry.hash ?? "") || (await digest(path.join(payload, entry.path))) !== entry.hash)
        ) {
            throw Error("Backup member integrity failed");
        }
    }
    if (input.mode === "restore") {
        async function clear(relative: string) {
            for (const name of await fs.readdir(path.join(input.data, relative))) {
                const member = relative ? `${relative}/${name}` : name;
                if (excluded.has(member)) {
                    continue;
                }
                if (member === "repository") {
                    await clear(member);
                } else {
                    await fs.rm(path.join(input.data, member), { recursive: true, force: true });
                }
            }
        }
        await clear("");
        for (const entry of entries) {
            const target = path.join(input.data, entry.path);
            if (entry.kind === "directory") {
                await fs.mkdir(target, { mode: 0o700, recursive: true });
            } else {
                await fs.copyFile(path.join(payload, entry.path), target);
                await sync(target);
            }
        }
        for (const entry of entries.toReversed()) {
            const target = path.join(input.data, entry.path);
            await fs.chown(target, entry.uid, entry.gid);
            await fs.chmod(target, entry.mode);
            if (entry.kind === "directory") {
                await sync(target);
            }
        }
        await sync(input.data);
    }
    return {
        treeDigest: await digest(index),
        files: entries.filter((e) => e.kind === "file").length,
        bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    };
}
