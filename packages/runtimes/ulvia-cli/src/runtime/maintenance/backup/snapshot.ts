import { mkdir, realpath, lstat } from "node:fs/promises";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicPrivateWrite, readPrivateFile } from "../../stack/orchestration/deployment/storage";
import { readDeploymentState } from "../../stack/orchestration/state";
import { pinnedOfficialImageReference, ensureOfficialImage } from "../../stack/orchestration/images";
import { prepareInfrastructureImages } from "../../stack/orchestration/deployment/execute";
import { deploymentProject } from "../../stack/orchestration/deployment/artifacts";
import type { UlviaPaths } from "../../paths";
import type { LocalServicesState } from "../../stack/orchestration/state";
import { treeInContainer } from "./docker";
type BackupSnapshot = {
    schema: "ulvia.installation-backup/v1";
    id: string;
    createdAt: string;
    data: string;
    treeDigest: string;
    files: number;
    bytes: number;
    deploymentId: string;
    version: string;
};
async function backupLocation(paths: UlviaPaths, destination: string) {
    if (!isAbsolute(destination)) {
        throw new Error("Backup directory must be absolute");
    }
    const source = await realpath(paths.data),
        target = resolve(destination);
    const within = (a: string, b: string) => {
        const r = relative(a, b);
        return !r || (r !== ".." && !r.startsWith("../") && !isAbsolute(r));
    };
    if (within(source, target) || within(target, source) || (await realpath(dirname(target))) !== dirname(target)) {
        throw new Error("Backup must use a real directory outside the installation");
    }
    return target;
}
export async function newBackupLocation(paths: UlviaPaths, destination: string) {
    const target = await backupLocation(paths, destination);
    try {
        await lstat(target);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return target;
        }
        throw error;
    }
    throw new Error("Backup destination already exists; choose a new directory");
}
export async function createSnapshot(paths: UlviaPaths, destination: string, state: LocalServicesState) {
    const backup = await newBackupLocation(paths, destination);
    await mkdir(backup, { mode: 0o700 });
    const result = await treeInContainer("create", paths, backup, pinnedOfficialImageReference(state.images.provider));
    const record: BackupSnapshot = {
        schema: "ulvia.installation-backup/v1",
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        data: await realpath(paths.data),
        ...result,
        deploymentId: state.id,
        version: state.release.version,
    };
    await atomicPrivateWrite(join(backup, "backup.json"), JSON.stringify(record));
    await verifySnapshot(paths, backup);
    return backup;
}
export async function verifySnapshot(paths: UlviaPaths, backup: string) {
    backup = await backupLocation(paths, backup);
    const stat = await lstat(backup);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
        throw new Error("Backup directory must be private and regular");
    }
    const text = await readPrivateFile(join(backup, "backup.json"));
    if (text === null) {
        throw new Error("Backup is incomplete: its completion receipt is missing");
    }
    const value = JSON.parse(text) as BackupSnapshot;
    if (
        !value ||
        Object.keys(value).sort().join(",") !==
            "bytes,createdAt,data,deploymentId,files,id,schema,treeDigest,version" ||
        value.schema !== "ulvia.installation-backup/v1" ||
        typeof value.id !== "string" ||
        !/^[a-f0-9-]{36}$/u.test(value.id) ||
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        new Date(value.createdAt).toISOString() !== value.createdAt ||
        value.data !== (await realpath(paths.data)) ||
        !/^[a-f0-9]{64}$/u.test(value.treeDigest) ||
        ![value.bytes, value.files].every((n) => Number.isSafeInteger(n) && n >= 0)
    ) {
        throw new Error("Backup does not belong to this installation or has invalid metadata");
    }
    const snapshotPaths = { ...paths, services: join(backup, "payload/services") };
    const state = await readDeploymentState(snapshotPaths);
    if (
        !state?.applied ||
        state.operation ||
        state.applied.id !== value.deploymentId ||
        state.applied.release.version !== value.version
    ) {
        throw new Error("Backup must contain a complete applied deployment");
    }
    await deploymentProject(snapshotPaths, state.applied);
    await Promise.all(Object.values(state.applied.images).map(ensureOfficialImage));
    await prepareInfrastructureImages(state.applied);
    const result = await treeInContainer(
        "verify",
        paths,
        backup,
        pinnedOfficialImageReference(state.applied.images.provider),
    );
    if (result.treeDigest !== value.treeDigest || result.files !== value.files || result.bytes !== value.bytes) {
        throw new Error("Backup integrity does not match its completion receipt");
    }
    return { record: value, state: state.applied };
}
