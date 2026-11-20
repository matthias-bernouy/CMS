import { isAbsolute, resolve } from "node:path";

export interface CaptureConnection {
    readonly socketDirectory: string;
    readonly groupId: number;
}

export function parseCaptureConnection(value: unknown): CaptureConnection {
    const row = value as Partial<CaptureConnection> | null;
    if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).sort().join(",") !== "groupId,socketDirectory" ||
        typeof row.socketDirectory !== "string" ||
        !isAbsolute(row.socketDirectory) ||
        resolve(row.socketDirectory) === "/" ||
        row.socketDirectory.includes("\n") ||
        !Number.isInteger(row.groupId) ||
        row.groupId! < 1 ||
        row.groupId! > 4294967294
    ) {
        throw new Error("Capture connection requires an absolute socket directory and a nonzero numeric group ID");
    }
    return { socketDirectory: resolve(row.socketDirectory), groupId: row.groupId! };
}

export function configuredCaptureConnection(
    current: CaptureConnection | undefined,
    values: ReadonlyMap<string, string>,
) {
    const directory = values.get("--capture-socket-directory");
    const group = values.get("--capture-group");
    if (directory === "disabled") {
        if (group !== undefined) {
            throw new Error("Disabling captures does not accept a group");
        }
        return undefined;
    }
    if (directory === undefined && group === undefined) {
        return current;
    }
    if (group !== undefined && !/^[0-9]+$/u.test(group)) {
        throw new Error("--capture-group requires an integer group ID");
    }
    return parseCaptureConnection({
        socketDirectory: directory ?? current?.socketDirectory,
        groupId: group === undefined ? current?.groupId : Number(group),
    });
}
