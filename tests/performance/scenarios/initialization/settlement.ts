import { readProbe } from "../../harness/docker/probe";

/** Edge failure may precede Provider termination. Keep collecting the original trace before another sample starts. */
export async function settleInitialization(providerName: string, traceId: string) {
    const deadline = performance.now() + 75_000;
    do {
        const rows = await readProbe(providerName, traceId);
        if (rows.some((row) => row.kind === "initialization-phase" && row.name === "plan.total")) {
            return true;
        }
        await Bun.sleep(250);
    } while (performance.now() < deadline);
    return false;
}
