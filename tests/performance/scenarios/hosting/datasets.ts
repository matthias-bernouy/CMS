import { randomUUID } from "node:crypto";
import { requireRecord } from "../queries/types";
import { assertCondition } from "../queries/types";
import { discardDisabledTenantDatabase } from "../../harness/docker/cleanup/tenant";
import type { HostingContext } from "./context";
import type { Variant } from "../../capabilities/types";

export const HOSTING_DATASET_SIZE = 64;

/** Historical fixtures contain completed disabled lifecycles; large fixtures retain ready/pending records. */
export async function hostingDataset(
    context: HostingContext,
    kind: "instances" | "domains" | "zones",
    variant: Variant,
) {
    if (variant !== "large" && variant !== "history") {
        return;
    }
    const key = `${kind}:${variant}`;
    let pending = context.seeds.get(key);
    if (!pending) {
        pending = (async () => {
            const anchor = kind === "domains" ? await context.anchor() : undefined;
            for (let index = 0; index < HOSTING_DATASET_SIZE; index++) {
                if (kind === "instances") {
                    const created = await context.create();
                    if (variant === "history") {
                        await context.checked("instances.disable", { instanceId: created.instance.id });
                        assertCondition(typeof created.instance.id === "string");
                        await discardDisabledTenantDatabase(context.environment.stack, {
                            instanceId: created.instance.id,
                            origin: created.input.origin,
                        });
                    }
                } else {
                    const hostname = `dataset-${variant}-${randomUUID()}.performance.test`;
                    const claimed = await context.checked(
                        `${kind}.claim`,
                        kind === "domains"
                            ? { instanceId: anchor!.instance.id, origin: `https://${hostname}` }
                            : { hostname },
                    );
                    if (variant === "history") {
                        const record = requireRecord(kind === "domains" ? claimed.domain : claimed.zone);
                        await context.checked(`${kind}.disable`, { hostname, expectedRevision: record.revision });
                    }
                }
            }
        })();
        context.seeds.set(key, pending);
    }
    await pending;
}
