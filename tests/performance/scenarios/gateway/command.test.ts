import { expect, test } from "bun:test";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { performanceCapabilityInventory } from "../../capabilities/inventory";
import { prepareGatewayCommand } from "./command";
import type { GatewayContext } from "./context";

test("command token postconditions use valid admitted input, the signed byte count and the exact request identity", async () => {
    const inventory = await performanceCapabilityInventory();
    const target = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content" && row.definition.id === "site.update",
    )!;
    let requestId = "";
    let bytes = 0;
    const calls: string[] = [];
    let terminal: unknown;
    const call: GatewayContext["call"] = async (capability, input, assert = () => {}, token, contractId, id) => {
        calls.push(capability);
        let status = 200;
        let output: unknown;
        if (capability === "gateway.command.prepare") {
            const invocation = input.invocation as Record<string, unknown>;
            requestId = String(invocation.requestId);
            bytes = Number(invocation.bodyBytes);
            output = { failure: null, prepared: { token: "t".repeat(32), instanceId: "instance-a", delegation: null } };
            assert(output);
        } else {
            expect(capability).toBe("site.update");
            validateSchemaValue(target.definition.input, input);
            expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBe(bytes);
            expect(contractId).toBe("ulvia/cms.content");
            expect(token).toBe("t".repeat(32));
            status = id === requestId ? 409 : 400;
        }
        return {
            output,
            observation: {
                traceId: id ?? "control-test",
                status,
                durationMs: 1,
                requestBytes: bytes,
                responseBytes: 1,
                validated: status === 200,
                completed: true,
                streamConsumed: true,
            },
        };
    };
    const context = {
        call,
        content: { release: target.release },
        readers: { provider: async () => ({ entry: { id: "installation-a", providerId: "ulvia/provider" } }) },
        environment: { main: { subjectId: "admin" }, stack: { instanceId: "instance-a" } },
        checked: async (capability: string, input: Record<string, unknown>) => {
            expect(capability).toBe("gateway.audit.append");
            terminal = JSON.parse(String(input.event));
            return {};
        },
    } as unknown as GatewayContext;
    const sample = await prepareGatewayCommand(context);
    expect((await sample.send()).validated).toBe(true);
    expect(calls).toEqual(["gateway.command.prepare", "site.update", "site.update"]);
    expect(terminal).toMatchObject({ requestId, stage: "declared-error", status: 409, errorCode: "REVISION_CONFLICT" });
    await sample.close?.();
});
