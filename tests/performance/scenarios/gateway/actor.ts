import { scenarioClient } from "../../harness/clients/session";
import { assertCondition, requireRecord } from "../queries/types";
import { machineInvocation } from "./machine";
import type { GatewayContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";
import type { Variant } from "../../capabilities/types";
import { accessReadContext } from "../access/advanced/context";

export async function prepareActorInspection(context: GatewayContext, variant?: Variant): Promise<PreparedSample> {
    const owned = variant === "invalidation" ? accessReadContext(context.inventory, context.environment) : undefined;
    try {
        return await actorInspection(context, owned);
    } catch (error) {
        await owned?.close();
        throw error;
    }
}

async function actorInspection(
    context: GatewayContext,
    owned?: ReturnType<typeof accessReadContext>,
): Promise<PreparedSample> {
    const contractId = "ulvia/cms.access";
    const capabilityId = "inspect-actor";
    const send = await machineInvocation(context, contractId, capabilityId);
    const account = await owned?.create();
    const input = { subjectId: account?.sub ?? context.environment.main.subjectId };
    if (owned) {
        const prime = await (await machineInvocation(context, contractId, capabilityId))(input);
        const before = requireRecord(prime.output);
        assertCondition(
            prime.observation.validated && before.administrator === false && before.authorizationRevision === 0,
        );
        const changed = await owned.fixture("set-administrator", {
            sub: input.subjectId,
            enabled: true,
            expectedRevision: 0,
        });
        assertCondition(changed.administrator === true && changed.revision === 1);
    }
    const assert = (output: unknown) => {
        const row = requireRecord(output);
        assertCondition(
            row.state === "authenticated" && row.subjectId === input.subjectId && row.administrator === true,
        );
        assertCondition(Number.isSafeInteger(row.authorizationRevision) && Number(row.authorizationRevision) >= 0);
        if (owned) {
            assertCondition(row.authorizationRevision === 1, "machine-actor-stale-authorization");
        }
    };
    return {
        async send() {
            return (await send(input, assert)).observation;
        },
        async verify() {
            const ordinary = await scenarioClient(context.inventory, context.environment.main)(
                contractId,
                capabilityId,
                "http",
                input,
            );
            assertCondition(!ordinary.observation.validated && ordinary.observation.status === 403);
            const anonymous = await (await machineInvocation(context, contractId, capabilityId))({
                subjectId: `missing-subject-${crypto.randomUUID()}`,
            });
            assertCondition(anonymous.observation.validated);
            assertCondition(requireRecord(anonymous.output).state === "anonymous");
            const retained = await (await machineInvocation(context, contractId, capabilityId))(input, assert);
            assertCondition(retained.observation.validated);
            if (owned) {
                const demoted = await owned.fixture("set-administrator", {
                    sub: input.subjectId,
                    enabled: false,
                    expectedRevision: 1,
                });
                assertCondition(demoted.revision === 2 && demoted.administrator === false);
                const result = await (await machineInvocation(context, contractId, capabilityId))(input);
                const current = requireRecord(result.output);
                assertCondition(
                    result.observation.validated &&
                        current.subjectId === input.subjectId &&
                        current.administrator === false &&
                        current.authorizationRevision === 2,
                    "machine-actor-demotion-not-visible",
                );
            }
        },
        close: owned?.close,
    };
}
