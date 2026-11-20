import { hostedInput } from "./context";
import { assertCondition, requireRecord } from "../queries/types";
import { retainDisabledTenantDatabase } from "../../harness/docker/cleanup/tenant";
import type { HostingContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";

/** Each measured sample elects a distinct tenant's active alias, including under concurrency. */
export async function preparePrimaryElection(context: HostingContext, binding: string): Promise<PreparedSample> {
    const created = await context.create();
    const alias = hostedInput(context.control.origin).origin;
    const domain = requireRecord(
        (await context.checked("domains.claim", { instanceId: created.instance.id, origin: alias })).domain,
    );
    const capability = "instances.set-primary-domain";
    const input = {
        instanceId: created.instance.id,
        hostname: domain.hostname,
        expectedInstanceRevision: created.instance.revision,
        expectedDomainRevision: domain.revision,
    };
    let output: Readonly<Record<string, unknown>> | undefined;
    await context.prepare(binding);
    return {
        async send() {
            const result = await context.call(capability, binding, input, (value) => {
                output = requireRecord(value);
                const electedDomain = requireRecord(output.domain);
                assertCondition(
                    output.instanceId === created.instance.id &&
                        output.origin === alias &&
                        output.revision === Number(created.instance.revision) + 1 &&
                        electedDomain.hostname === domain.hostname &&
                        electedDomain.revision === Number(domain.revision) + 1,
                );
            });
            return result.observation;
        },
        async verify() {
            await context.foreign(capability, input);
            const stored = await context.checked("instances.get", { instanceId: input.instanceId });
            assertCondition(stored.origin === alias && stored.revision === output!.revision);
            const replay = await context.checked(capability, input);
            assertCondition(replay.origin === alias && replay.revision === stored.revision);
            await context.refused(capability, { ...input, hostname: new URL(created.input.origin).hostname }, 409);
            const unchanged = await context.checked("instances.get", { instanceId: input.instanceId });
            assertCondition(unchanged.origin === alias && unchanged.revision === stored.revision);
            await context.refused(
                "domains.disable",
                {
                    hostname: domain.hostname,
                    expectedRevision: requireRecord(output!.domain).revision,
                },
                409,
            );
        },
        async close() {
            await context.checked("instances.disable", { instanceId: input.instanceId });
            assertCondition(typeof input.instanceId === "string");
            await retainDisabledTenantDatabase(context.environment.stack, {
                instanceId: input.instanceId,
                origin: created.input.origin,
            });
        },
    };
}
