import { lstat } from "node:fs/promises";
import type { CaptureConnection } from "./configuration";

export async function captureProviderMount(connection?: CaptureConnection) {
    if (!connection) {
        return {};
    }
    const directory = await lstat(connection.socketDirectory);
    if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        (directory.mode & 0o007) !== 0 ||
        directory.gid !== connection.groupId
    ) {
        throw new Error("Capture socket directory must be real, private and owned by its configured shared group");
    }
    return {
        provider: {
            environment: { ULVIA_CAPTURE_SOCKET: "/run/ulvia-capture/worker.sock" },
            group_add: [String(connection.groupId)],
            volumes: [
                {
                    type: "bind",
                    source: connection.socketDirectory,
                    target: "/run/ulvia-capture",
                    read_only: true,
                    bind: { create_host_path: false },
                },
            ],
        },
    };
}
