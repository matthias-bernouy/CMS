import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";

/** Bounded independent reads; preserve catalogue/parent order and drain every started read on failure. */
export async function collectMcpContracts(
    ids: readonly string[],
    resolve: (id: string) => Promise<AdmittedContractRelease>,
    concurrency = 2,
): Promise<readonly AdmittedContractRelease[]> {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 2) {
        throw new TypeError("Catalogue read concurrency must be one or two");
    }
    const queue = [...ids];
    const contracts = new Map<string, AdmittedContractRelease>();
    while (queue.length) {
        if (contracts.size >= 256) {
            throw new Error("Selected contract catalogue is too large");
        }
        const batch: string[] = [];
        while (queue.length && batch.length < concurrency && contracts.size + batch.length < 256) {
            const id = queue.shift()!;
            if (!contracts.has(id) && !batch.includes(id)) {
                batch.push(id);
            }
        }
        const results = await Promise.allSettled(batch.map((id) => Promise.resolve().then(() => resolve(id))));
        for (let index = 0; index < results.length; index++) {
            const result = results[index]!;
            if (result.status === "rejected") {
                throw result.reason;
            }
            contracts.set(batch[index]!, result.value);
            if (result.value.release.extends) {
                queue.push(result.value.release.extends.contractId);
            }
        }
    }
    return [...contracts.values()];
}
