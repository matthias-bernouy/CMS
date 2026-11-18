import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { readProviderCredential } from "../../../../integration/instance/providers/credentials";
import { assertCondition, requireRecord } from "../../queries/types";
import { callConnection } from "./call";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { QueryEnvironment } from "../../queries/execute";
import type { ProviderPeer } from "../peer";

export async function prepareTechnicalConnection(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    peer: ProviderPeer,
): Promise<PreparedSample> {
    const control = environment.stack.providerControl;
    assertCondition(control);
    const origin = await control.origin();
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/provider.connections" &&
            row.definition.id === "connections.configure",
    );
    assertCondition(target);
    const input = {
        connectionId: `performance-${crypto.randomUUID()}`,
        cmsUrl: environment.main.origin,
        token: crypto.randomUUID().replaceAll("-", ""),
        generation: 1,
    };
    // Provisioning's access token authenticates control APIs; SDK invocation signing needs the account secret.
    const credential = await readProviderCredential(environment.stack.providerName, environment.stack.id);
    const account = { instanceId: environment.stack.instanceId, secret: credential.token };
    const send = (body: Readonly<Record<string, unknown>>, identity = account, connectionId = input.connectionId) =>
        callConnection(
            {
                origin,
                target,
                binding: "http",
                input: body,
                credentials: {},
                assert(value) {
                    const row = requireRecord(value);
                    assertCondition(
                        row.configured === true && row.connectionId === input.connectionId,
                        "technical-connection-acknowledgement",
                    );
                },
            },
            identity,
            connectionId,
        );
    const stored = (key = environment.stack.id) =>
        readProviderCredential(environment.stack.providerName, key, input.connectionId);
    return {
        send: () => send(input),
        async verify() {
            assertCondition(
                canonicalizeIJson(await stored()) === canonicalizeIJson(input),
                "technical-connection-durable-record",
            );
            assertCondition((await send(input)).validated, "technical-connection-idempotent-replay");
            const conflict = await send({ ...input, token: crypto.randomUUID().replaceAll("-", "") });
            assertCondition(
                !conflict.validated && conflict.status === 409,
                `technical-connection-generation-conflict-status-${conflict.status}`,
            );
            const wrongScope = await send(input, account, `foreign-${crypto.randomUUID()}`);
            assertCondition(
                !wrongScope.validated && wrongScope.status === 403,
                `technical-connection-authority-mismatch-status-${wrongScope.status}`,
            );
            const unauthorized = await send(input, { ...account, secret: crypto.randomUUID().replaceAll("-", "") });
            assertCondition(!unauthorized.validated && unauthorized.status === 401);
            assertCondition(canonicalizeIJson(await stored()) === canonicalizeIJson(input));
            // Same connection ID under another real account must remain a separate persisted resource.
            const foreign = { ...input, token: crypto.randomUUID().replaceAll("-", "") };
            const paired = await send(foreign, { instanceId: peer.report.instanceId, secret: peer.token });
            assertCondition(paired.validated, "technical-connection-account-isolation-setup");
            assertCondition(
                canonicalizeIJson(await stored(`${environment.stack.id}-named`)) === canonicalizeIJson(foreign),
            );
            assertCondition(
                canonicalizeIJson(await stored()) === canonicalizeIJson(input),
                "technical-connection-account-isolation",
            );
            const rotated = { ...input, generation: 2, token: crypto.randomUUID().replaceAll("-", "") };
            assertCondition((await send(rotated)).validated);
            const stale = await send(input);
            assertCondition(!stale.validated && stale.status === 409);
            assertCondition(canonicalizeIJson(await stored()) === canonicalizeIJson(rotated));
        },
    };
}
