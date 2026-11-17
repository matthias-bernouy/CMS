import type { sharedDeployment } from "./deployment";
import { provisionInstance } from "../provision";

/** A fresh tenant uses another domain on the existing shared listener. */
export async function scratchSite(stack: Awaited<ReturnType<typeof sharedDeployment>>, alias: string) {
    if (!/^[a-z][a-z0-9-]{0,40}$/u.test(alias)) {
        throw new Error("Invalid scratch site alias");
    }
    const { cluster, providerUrl, operatorToken, administrator, hosting } = stack;
    const url = new URL(hosting.origin);
    url.hostname = `${alias}.localhost`;
    const origin = url.origin;
    const name = `${cluster.id}-${alias}`;
    const instance = await provisionInstance(providerUrl, operatorToken, name, origin, administrator, origin);
    await hosting.claimDomain(instance.instance.id, origin);
    return { url: origin, name, administrator, instanceId: instance.instance.id };
}
