import { ClientFailure } from "../../../harness/clients/failure";

/** Leases keep revision-controlled samples independent while bounding real tenant count. */
export function fixturePool<T>(limit: number, create: (index: number) => Promise<T>) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) {
        throw new Error("Invalid performance fixture pool bound");
    }
    const slots: { busy: boolean; value: Promise<T> }[] = [];
    return {
        async acquire() {
            let slot = slots.find((entry) => !entry.busy);
            if (!slot) {
                if (slots.length >= limit) {
                    throw new ClientFailure("fixture-tenant-pool-exhausted");
                }
                const index = slots.length;
                slot = { busy: false, value: Promise.resolve().then(() => create(index)) };
                slots.push(slot);
            }
            slot.busy = true;
            let released = false;
            const release = () => {
                if (!released) {
                    released = true;
                    slot.busy = false;
                }
            };
            try {
                return { value: await slot.value, release };
            } catch (error) {
                release();
                throw error;
            }
        },
    };
}
