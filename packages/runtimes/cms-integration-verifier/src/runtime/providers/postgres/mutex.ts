import type { SQL } from "bun";

const MUTATION_LOCK_CLASS = 1_128_491_771;
const MUTATION_LOCK_OBJECT = 1_889_964_213;

export async function withPostgresProviderMutationLock<T>(
    admin: SQL,
    operation: (locked: SQL) => Promise<T>,
): Promise<T> {
    const locked = await admin.reserve();
    let acquired = false;
    try {
        await locked.unsafe(`select pg_catalog.pg_advisory_lock(${MUTATION_LOCK_CLASS}, ${MUTATION_LOCK_OBJECT})`);
        acquired = true;
        await assertPostgresProviderMutationLock(locked);
        return await operation(locked);
    } finally {
        if (acquired) {
            const rows = (await locked
                .unsafe(
                    `select pg_catalog.pg_advisory_unlock(${MUTATION_LOCK_CLASS}, ${MUTATION_LOCK_OBJECT}) as unlocked`,
                )
                .catch(() => [])) as Array<{ unlocked: boolean }>;
            if (rows[0]?.unlocked !== true) {
                await locked.release();
                throw new Error("Disposable PostgreSQL provider mutation lock was lost");
            }
        }
        await locked.release();
    }
}

export async function assertPostgresProviderMutationLock(locked: SQL): Promise<void> {
    const rows = (await locked.unsafe(`select exists(
      select 1 from pg_catalog.pg_locks
      where pid = pg_catalog.pg_backend_pid() and locktype = 'advisory' and granted
        and classid = ${MUTATION_LOCK_CLASS}::oid and objid = ${MUTATION_LOCK_OBJECT}::oid
    ) as held`)) as Array<{ held: boolean }>;
    if (rows.length !== 1 || !rows[0]?.held) {
        throw new Error("Disposable PostgreSQL provider mutation requires the provider lock");
    }
}
