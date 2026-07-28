import type { SQL } from "bun";
import type { PostgresOwnershipIdentity } from "./contract";
import { heartbeatPostgresOwnership } from "./lease";

export type PostgresOwnershipHeartbeat = Readonly<{
    assertHealthy(): void;
    invalidate(error: unknown): void;
    stop(): void;
}>;

export function createPostgresOwnershipHeartbeat(
    admin: SQL,
    marker: PostgresOwnershipIdentity,
    config: Readonly<{ heartbeatIntervalMs: number; leaseDurationMs: number }>,
    active: Set<PostgresOwnershipHeartbeat>,
): PostgresOwnershipHeartbeat {
    let stopped = false;
    let running = false;
    let failure: unknown;
    const heartbeat: PostgresOwnershipHeartbeat = {
        assertHealthy() {
            if (failure) {
                throw failure;
            }
        },
        invalidate(error: unknown) {
            failure = error;
            heartbeat.stop();
        },
        stop() {
            if (!stopped) {
                stopped = true;
                clearInterval(timer);
                active.delete(heartbeat);
            }
        },
    };
    const timer = setInterval(async () => {
        if (stopped || running) {
            return;
        }
        running = true;
        try {
            await heartbeatPostgresOwnership(admin, marker, config.leaseDurationMs);
            failure = undefined;
        } catch (error) {
            failure = error;
        } finally {
            running = false;
        }
    }, config.heartbeatIntervalMs);
    timer.unref();
    active.add(heartbeat);
    return heartbeat;
}
