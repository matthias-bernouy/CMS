import type { SQL } from "bun";
import {
    isDisposablePostgresDatabase,
    isDisposablePostgresRole,
    postgresIdentifier as identifier,
    type PostgresProviderConfig,
} from "./configuration";
import { assertPostgresServerFingerprint, readPostgresServerFingerprint } from "./fingerprint";
import { assertSandboxActorMemberships } from "./environment";
import { assertPostgresProviderMutationLock } from "./mutex";
import {
    assertDisposablePostgresRoleSettings,
    assertPostgresObjectOwnership,
    assertPostgresRoleSecurity,
    deletePostgresOwnership,
    preparePostgresOwnershipRelease,
    readPostgresOwnedObjects,
    readPostgresOwnership,
    type PostgresOwnershipIdentity,
    type PostgresOwnershipMarker,
} from "./ownership";

export const POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION = "confirm-owned-disposable-postgres-recovery" as const;

export async function recoverDisposablePostgresObjects(
    admin: SQL,
    input: Readonly<{
        confirmation: typeof POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION;
        serverFingerprint: string;
    }>,
): Promise<void> {
    requireConfirmation(input.confirmation, "recovery");
    await assertPostgresProviderMutationLock(admin);
    await assertPostgresServerFingerprint(admin, input.serverFingerprint);
    const inventory = await readRecoveryInventory(admin, input.serverFingerprint);
    for (const marker of inventory.markers.filter((entry) => entry.expired)) {
        const releasing = await preparePostgresOwnershipRelease(admin, marker);
        if (releasing) {
            await dropOwnedObjects(admin, releasing);
            await deletePostgresOwnership(admin, releasing);
        }
    }
}

export async function assertDisposablePostgresOwnershipInventory(
    admin: SQL,
    serverFingerprint: string,
    config: PostgresProviderConfig,
): Promise<void> {
    await assertPostgresServerFingerprint(admin, serverFingerprint);
    const inventory = await readRecoveryInventory(admin, serverFingerprint);
    for (const marker of inventory.markers) {
        if (marker.state === "reserved" || marker.state === "releasing") {
            continue;
        }
        const role = inventory.objects.roles.find((entry) => entry.name === marker.role);
        if (!role) {
            throw new Error("Disposable PostgreSQL ownership journal lost its role");
        }
        assertPostgresRoleSecurity(role);
        await assertDisposablePostgresRoleSettings(admin, marker, config);
        await assertSandboxActorMemberships(admin, marker.role);
    }
}

export async function releaseDisposablePostgresObjects(
    admin: SQL,
    marker: PostgresOwnershipIdentity,
    confirmation: typeof POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION,
): Promise<void> {
    requireConfirmation(confirmation, "release");
    await assertPostgresProviderMutationLock(admin);
    if ((await readPostgresServerFingerprint(admin)) !== marker.serverFingerprint) {
        const objects = await readPostgresOwnedObjects(admin);
        if (
            !objects.databases.some(({ name }) => name === marker.database) &&
            !objects.roles.some(({ name }) => name === marker.role)
        ) {
            return;
        }
        throw new Error("Disposable PostgreSQL release target belongs to a replaced cluster");
    }
    const inventory = await readRecoveryInventory(admin, marker.serverFingerprint);
    const owned = inventory.markers.find((entry) => sameOwnership(entry, marker));
    if (!owned) {
        if (
            !inventory.objects.databases.some(({ name }) => name === marker.database) &&
            !inventory.objects.roles.some(({ name }) => name === marker.role)
        ) {
            return;
        }
        throw new Error("Disposable PostgreSQL release target is not owned by this lease and fence");
    }
    const releasing = await preparePostgresOwnershipRelease(admin, owned);
    if (!releasing) {
        throw new Error("Disposable PostgreSQL ownership disappeared during release");
    }
    await dropOwnedObjects(admin, releasing);
    await deletePostgresOwnership(admin, releasing);
}

async function readRecoveryInventory(admin: SQL, serverFingerprint: string) {
    const markers = await readPostgresOwnership(admin);
    if (markers.some((marker) => marker.serverFingerprint !== serverFingerprint)) {
        throw new Error("Disposable PostgreSQL ownership marker server fingerprint does not match");
    }
    const objects = await readPostgresOwnedObjects(admin);
    assertPostgresObjectOwnership(markers, objects);
    return { markers, objects };
}

async function dropOwnedObjects(admin: SQL, marker: PostgresOwnershipMarker): Promise<void> {
    if (
        marker.state !== "releasing" ||
        !isDisposablePostgresDatabase(marker.database) ||
        !isDisposablePostgresRole(marker.role)
    ) {
        throw new TypeError("Disposable PostgreSQL recovery returned an unsafe journal state or object identity");
    }
    const inventory = await readRecoveryInventory(admin, marker.serverFingerprint);
    const current = inventory.markers.find((entry) => sameOwnership(entry, marker));
    if (!current || current.state !== "releasing") {
        throw new Error("Disposable PostgreSQL destructive target lost its ownership fence");
    }
    await admin.unsafe(`drop database if exists ${identifier(marker.database)} with (force)`);
    await admin.unsafe(`drop role if exists ${identifier(marker.role)}`);
}

function requireConfirmation(actual: typeof POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION, operation: string): void {
    if (actual !== POSTGRES_DESTRUCTIVE_RECOVERY_CONFIRMATION) {
        throw new TypeError(`Disposable PostgreSQL destructive ${operation} was not explicitly confirmed`);
    }
}

function sameOwnership(left: PostgresOwnershipIdentity, right: PostgresOwnershipIdentity): boolean {
    return (
        left.database === right.database &&
        left.role === right.role &&
        left.serverFingerprint === right.serverFingerprint &&
        left.instanceId === right.instanceId &&
        left.leaseToken === right.leaseToken &&
        left.fencingToken === right.fencingToken &&
        left.jobDigest === right.jobDigest
    );
}
