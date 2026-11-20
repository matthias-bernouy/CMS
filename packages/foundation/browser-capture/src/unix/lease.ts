import { Database } from "bun:sqlite";
import { constants } from "node:fs";
import { open, lstat, unlink } from "node:fs/promises";
import { connect } from "node:net";
import { CaptureError } from "../core/limits";

/** The kernel releases this empty SQLite transaction even after SIGKILL. Keep its inode. */
export async function captureSocketLease(socketPath: string) {
    const path = `${socketPath}.lock`;
    const file = await open(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    try {
        const state = await file.stat();
        if (!state.isFile() || state.nlink !== 1 || state.uid !== process.getuid?.() || state.size !== 0) {
            throw new Error("Capture listener lock must be an owned empty regular file");
        }
    } finally {
        await file.close();
    }
    const database = new Database(path, { create: false });
    let released = false;
    const release = () => {
        if (!released) {
            released = true;
            database.close();
        }
    };
    try {
        database.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
        const old = await lstat(socketPath).catch((cause: NodeJS.ErrnoException) => {
            if (cause.code === "ENOENT") {
                return undefined;
            }
            throw cause;
        });
        if (old) {
            if (!old.isSocket() || old.uid !== process.getuid?.()) {
                throw new Error("Capture socket path is occupied by another file or owner");
            }
            await requireDisconnectedSocket(socketPath);
            const current = await lstat(socketPath);
            if (current.ino !== old.ino || current.dev !== old.dev) {
                throw new CaptureError("BUSY");
            }
            await unlink(socketPath);
        }
        return { release };
    } catch (cause) {
        release();
        throw cause;
    }
}

function requireDisconnectedSocket(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const socket = connect({ path });
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new CaptureError("BUSY"));
        }, 1000);
        socket.once("connect", () => {
            clearTimeout(timer);
            socket.destroy();
            reject(new CaptureError("BUSY"));
        });
        socket.once("error", (cause: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            socket.destroy();
            if (cause.code === "ECONNREFUSED") {
                resolve();
            } else {
                reject(cause);
            }
        });
    });
}
