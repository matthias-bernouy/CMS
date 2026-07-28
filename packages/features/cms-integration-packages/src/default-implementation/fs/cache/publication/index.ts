import { constants } from "node:fs";
import { open, rename } from "node:fs/promises";
import type { IntegrationPackageLimits } from "../../../../interfaces/envelope";
import { objectPath, type IntegrationPackageCacheLayout } from "../paths";
import { IntegrationPackageCacheCorruptionError, type MaterializedIntegrationPackage } from "../types";
import { verifyCachedPackage } from "../verification";
import { syncDirectory } from "../writing";
import { withRepairLock } from "./locks";
import { destinationExists, quarantineIfPresent } from "./quarantine";
import type { PublishStagedPackageOptions } from "./types";

export async function publishStagedPackage(
    options: PublishStagedPackageOptions,
): Promise<MaterializedIntegrationPackage> {
    const destination = objectPath(options.layout, options.digest);
    try {
        await prepareStagingForRename(options.staging);
        await rename(options.staging, destination);
        await finalizeObject(options.layout, destination);
        return await requireValid(options);
    } catch (error) {
        if (!(await destinationExists(destination))) {
            throw error;
        }
    }
    const winner = await validOrMissing(options);
    if (winner) {
        return winner;
    }
    return await withRepairLock(options, async (assertOwned) => {
        const repairedByPeer = await validOrMissing(options);
        if (repairedByPeer) {
            return repairedByPeer;
        }
        await assertOwned();
        await quarantineIfPresent(options);
        try {
            await assertOwned();
            await prepareStagingForRename(options.staging);
            await rename(options.staging, destination);
            await finalizeObject(options.layout, destination);
        } catch (error) {
            if (!(await destinationExists(destination))) {
                throw error;
            }
        }
        return await requireValid(options);
    });
}

export async function validOrMissing(options: {
    layout: IntegrationPackageCacheLayout;
    digest: string;
    limits?: Partial<IntegrationPackageLimits>;
}): Promise<MaterializedIntegrationPackage | null> {
    try {
        return await verifyCachedPackage(options.layout, options.digest, options.limits);
    } catch (error) {
        if (error instanceof IntegrationPackageCacheCorruptionError) {
            return null;
        }
        throw error;
    }
}

async function prepareStagingForRename(staging: string): Promise<void> {
    // Linux rewrites the moved directory's `..` entry across these two parent
    // directories, so publication briefly restores owner write permission.
    const handle = await open(staging, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        await handle.chmod(0o750);
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function finalizeObject(layout: IntegrationPackageCacheLayout, destination: string): Promise<void> {
    const handle = await open(destination, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        await handle.chmod(0o550);
        await handle.sync();
    } finally {
        await handle.close();
    }
    await Promise.all([syncDirectory(layout.objects), syncDirectory(layout.staging)]);
}

async function requireValid(options: PublishStagedPackageOptions): Promise<MaterializedIntegrationPackage> {
    const result = await verifyCachedPackage(options.layout, options.digest, options.limits);
    if (!result) {
        throw new Error(`Integration package cache object ${options.digest} disappeared during publication`);
    }
    return result;
}
