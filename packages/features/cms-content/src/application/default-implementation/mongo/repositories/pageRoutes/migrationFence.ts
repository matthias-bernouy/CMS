import { randomUUIDv7 } from "bun";
import type { Collection } from "mongodb";
import { SYSTEM_ID, type SystemDoc } from "cms-content/application/default-implementation/mongo/repositories/documents";
import {
    readSystemDocument,
    reapExpiredPageWrites,
} from "cms-content/application/default-implementation/mongo/repositories/pageRoutes/systemFence";

type Systems = Collection<SystemDoc>;
const LEASE_MS = 30_000;
const RENEW_MS = 5_000;
const WAIT_ATTEMPTS = 900;
const WAIT_DELAY_MS = 50;
const liveMigrationTimers = new Map<string, ReturnType<typeof setInterval>>();
const stoppedMigrationTokens = new Set<string>();

/** Only a zero-writer, unchanged settings revision may start migration. */
export async function claimRouteMigration(
    systems: Systems,
    revision: number,
    migration: NonNullable<SystemDoc["routeMigration"]>,
): Promise<boolean> {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
        const owned = { ...migration, expiresAt: new Date(Date.now() + LEASE_MS) };
        const claimed = await systems.updateOne(
            { _id: SYSTEM_ID, settingsRevision: revision, activePageWrites: 0, routeMigration: { $exists: false } },
            { $set: { routeMigration: owned } },
        );
        if (claimed.matchedCount) {
            renewRouteMigration(systems, owned.token);
            return true;
        }
        const current = await reapExpiredPageWrites(systems);
        if (current.routeMigration) {
            throw new Error("Page route migration is in progress.");
        }
        if (current.settingsRevision !== revision) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, WAIT_DELAY_MS));
    }
    throw new Error("Page writes did not finish before language migration.");
}

/** Take over an interrupted migration only after its owner stopped renewing the claim. */
export async function claimInterruptedRouteMigration(
    systems: Systems,
): Promise<{ migration: NonNullable<SystemDoc["routeMigration"]>; revision: number } | null> {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
        const current = await readSystemDocument(systems);
        const pending = current.routeMigration;
        if (!pending) {
            return null;
        }
        if (
            liveMigrationTimers.has(pending.token) ||
            (!stoppedMigrationTokens.has(pending.token) &&
                pending.expiresAt &&
                pending.expiresAt.getTime() > Date.now())
        ) {
            await new Promise((resolve) => setTimeout(resolve, WAIT_DELAY_MS));
            continue;
        }
        const migration = { ...pending, token: randomUUIDv7(), expiresAt: new Date(Date.now() + LEASE_MS) };
        const claimed = await systems.updateOne(
            {
                _id: SYSTEM_ID,
                "routeMigration.token": pending.token,
                ...(pending.expiresAt
                    ? { "routeMigration.expiresAt": pending.expiresAt }
                    : { "routeMigration.expiresAt": { $exists: false } }),
            },
            { $set: { routeMigration: migration } },
        );
        if (claimed.matchedCount) {
            renewRouteMigration(systems, migration.token);
            return { migration, revision: current.settingsRevision ?? 0 };
        }
    }
    throw new Error("Page route migration did not finish before startup.");
}

export function releaseRouteMigration(token: string): void {
    const timer = liveMigrationTimers.get(token);
    if (timer) {
        clearInterval(timer);
        liveMigrationTimers.delete(token);
    }
    stoppedMigrationTokens.add(token);
    const forgetting = setTimeout(() => stoppedMigrationTokens.delete(token), LEASE_MS);
    forgetting.unref();
}

function renewRouteMigration(systems: Systems, token: string): void {
    const timer = setInterval(() => {
        void systems
            .updateOne(
                { _id: SYSTEM_ID, "routeMigration.token": token },
                { $set: { "routeMigration.expiresAt": new Date(Date.now() + LEASE_MS) } },
            )
            .catch(() => undefined);
    }, RENEW_MS);
    timer.unref();
    liveMigrationTimers.set(token, timer);
}
