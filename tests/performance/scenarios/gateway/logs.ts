import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { scenarioClient } from "../../harness/clients/session";
import { assertCondition, requireRecord } from "../queries/types";
import { machineInvocation } from "./machine";
import type { GatewayContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareLogs(
    context: GatewayContext,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const contractId = "ulvia/cms.observability";
    const append = await machineInvocation(context, contractId, "logs.append");
    const client = scenarioClient(context.inventory, context.environment.main);
    const marker = crypto.randomUUID();
    const entry = {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        level: "info",
        event: "performance.assessment.machine",
        attributes: { fixture: marker, password: "never-store-performance-secret" },
    };
    const input = { entries: [entry] };
    const assertAppend = (output: unknown, duplicate = false) => {
        const row = requireRecord(output);
        assertCondition(
            row.accepted === 1 && row.stored === (duplicate ? 0 : 1) && row.duplicates === (duplicate ? 1 : 0),
        );
    };
    const assertEntry = (output: unknown) => {
        const row = requireRecord(output);
        const attributes = requireRecord(row.attributes);
        assertCondition(row.id === entry.id && row.instanceId === context.environment.stack.instanceId);
        assertCondition(row.time === entry.time && row.event === entry.event && row.service === "cms-edge");
        assertCondition(attributes.fixture === marker && attributes.password !== entry.attributes.password);
        assertCondition(typeof row.receivedAt === "string" && Number.isFinite(Date.parse(row.receivedAt)));
    };
    if (capability === "logs.get") {
        const seed = await append(input, assertAppend);
        assertCondition(seed.observation.validated);
    }
    const read = async () => {
        const result = await client(contractId, "logs.get", "http", { id: entry.id }, assertEntry);
        assertCondition(result.observation.validated);
        return result.output;
    };
    return {
        async send() {
            return capability === "logs.append"
                ? (await append(input, assertAppend)).observation
                : (await client(contractId, capability, binding, { id: entry.id }, assertEntry)).observation;
        },
        async verify() {
            const before = canonicalizeIJson(await read());
            if (capability === "logs.append") {
                const replay = await (await machineInvocation(context, contractId, capability))(input, (value) =>
                    assertAppend(value, true),
                );
                assertCondition(replay.observation.validated);
                const conflict = await (await machineInvocation(context, contractId, capability))({
                    entries: [{ ...entry, event: "performance.conflicting-entry" }],
                });
                assertCondition(!conflict.observation.validated && conflict.observation.status === 409);
                const future = await (await machineInvocation(context, contractId, capability))({
                    entries: [
                        { ...entry, id: crypto.randomUUID(), time: new Date(Date.now() + 3600_000).toISOString() },
                    ],
                });
                assertCondition(!future.observation.validated && future.observation.status === 422);
                const ordinary = await client(contractId, capability, "http", input);
                assertCondition(!ordinary.observation.validated && ordinary.observation.status === 403);
            } else {
                const missing = await client(contractId, capability, "http", { id: crypto.randomUUID() });
                assertCondition(!missing.observation.validated && missing.observation.status === 404);
            }
            assertCondition(canonicalizeIJson(await read()) === before);
        },
    };
}
