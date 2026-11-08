import { durableWriteFile, durableRename } from "../../filesystem/core/durable";
import { constants } from "node:fs";
import { parseSourceSnapshot } from "../snapshot";
import { createHash, randomUUID } from "node:crypto";
import { readFile, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { RepositoryRequestError } from "../../core/errors";

export interface PreparedCollection {
    readonly schema: "ulvia.collection-preparation.v1";
    readonly id: string;
    readonly digest: string;
    readonly sourceJson: string;
    readonly sourceDigest: string;
    readonly directory: string;
    readonly canonicalJson: string;
    readonly expiresAt: number;
    readonly repositoryId: string | null;
    readonly repositoryOrigin: string;
}
export function sourceDigest(value: string): string {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export async function writeRecord(directory: string, name: string, value: unknown): Promise<void> {
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    try {
        await durableWriteFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
        await durableRename(temporary, join(directory, name));
    } finally {
        await rm(temporary, { force: true });
    }
}
export function writePreparation(directory: string, value: PreparedCollection) {
    return writeRecord(directory, "prepared.json", value);
}

export async function readPreparation(
    root: string,
    id: string,
    expectedDigest: string,
): Promise<{ path: string; prepared: PreparedCollection }> {
    const refuse = () =>
        new RepositoryRequestError(
            "REJECTED",
            "Preparation is invalid, changed or expired. Prepare the exact sources again before publishing.",
        );
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id) || !/^sha256:[a-f0-9]{64}$/u.test(expectedDigest)) {
        throw refuse();
    }
    const path = join(root, id);
    let prepared: PreparedCollection;
    try {
        const file = join(path, "prepared.json");
        if ((await stat(file)).size > 32 * 1024 * 1024) {
            throw refuse();
        }
        prepared = parseStrictJson(await readFile(file), 32 * 1024 * 1024, 16) as unknown as PreparedCollection;
        if (
            prepared.schema !== "ulvia.collection-preparation.v1" ||
            prepared.id !== id ||
            !/^[a-z][a-z0-9-]{0,95}$/u.test(prepared.directory) ||
            prepared.digest !== expectedDigest ||
            typeof prepared.sourceJson !== "string" ||
            typeof prepared.canonicalJson !== "string" ||
            prepared.digest !== sourceDigest(prepared.canonicalJson) ||
            prepared.sourceDigest !== sourceDigest(prepared.sourceJson) ||
            !Number.isSafeInteger(prepared.expiresAt) ||
            prepared.expiresAt <= Date.now() ||
            typeof prepared.repositoryOrigin !== "string" ||
            (prepared.repositoryId !== null && typeof prepared.repositoryId !== "string")
        ) {
            throw refuse();
        }
    } catch (error) {
        if (["EACCES", "EPERM", "EIO", "EMFILE", "ENFILE"].includes((error as NodeJS.ErrnoException).code ?? "")) {
            throw error;
        }
        throw refuse();
    }
    return { path, prepared };
}

/** Refuse changed text sources before invoking the compiler; never follow substituted symlinks. */
export async function verifyPreparedSources(path: string, prepared: PreparedCollection): Promise<void> {
    const refuse = () =>
        new RepositoryRequestError("REJECTED", "Prepared collection sources changed. Prepare again before publishing.");
    for (const file of parseSourceSnapshot(prepared.sourceJson).files) {
        try {
            const handle = await open(
                join(path, prepared.directory, file.path),
                constants.O_RDONLY | constants.O_NOFOLLOW,
            );
            try {
                const info = await handle.stat();
                if (!info.isFile() || info.size > 1024 * 1024 || (await handle.readFile("utf8")) !== file.content) {
                    throw refuse();
                }
            } finally {
                await handle.close();
            }
        } catch (error) {
            if (["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
                throw refuse();
            }
            throw error;
        }
    }
}
