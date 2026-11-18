import { observeProvider } from "../../harness/clients/http";
import { ClientFailure } from "../../harness/clients/failure";
import { readerContext } from "../readers/context";
import { assertCondition, requireRecord } from "../queries/types";
import { TEST_SITE_ID } from "../../fixtures/scope";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

export async function gatewayContext(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const control = environment.stack.providerControl;
    assertCondition(control);
    const origin = await control.origin();
    const readers = readerContext(inventory, environment);
    const call = async (
        capability: string,
        input: Readonly<Record<string, unknown>>,
        assert: (output: unknown) => void = () => {},
        token = control.token,
        contractId = "ulvia/cms.installations",
        requestId = crypto.randomUUID(),
    ) => {
        const target = inventory.targets.find(
            (row) => !row.retained && row.release.contractId === contractId && row.definition.id === capability,
        );
        assertCondition(target);
        let output: unknown;
        const observation = await observeProvider(
            {
                origin,
                target,
                binding: "http",
                input,
                credentials: { token },
                assert(value) {
                    output = value;
                    assert(value);
                },
            },
            requestId,
        );
        return { output, observation };
    };
    const checked = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, input);
        if (!result.observation.validated) {
            throw new ClientFailure(`gateway-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
        }
        return result.output;
    };
    const refused = async (capability: string, input: Readonly<Record<string, unknown>>, statuses: number[]) => {
        const result = await call(capability, input);
        assertCondition(!result.observation.validated && statuses.includes(result.observation.status));
    };
    const unauthorized = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, input, undefined, "invalid-performance-control-credential");
        assertCondition(!result.observation.validated && result.observation.status === 401);
    };
    const content = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content" && row.definition.id === "site.get",
    );
    assertCondition(content);
    return { inventory, environment, call, checked, refused, unauthorized, readers, content };
}

export type GatewayContext = Awaited<ReturnType<typeof gatewayContext>>;

export function gatewayRoute(value: unknown) {
    const row = requireRecord(value);
    assertCondition(typeof row.route === "string");
    return requireRecord(JSON.parse(row.route));
}

export function assertGatewayScope(route: Readonly<Record<string, unknown>>, instanceId: string) {
    const selected = requireRecord(route.selection);
    const snapshot = requireRecord(route.installation);
    const installed = requireRecord(snapshot.installation);
    const report = requireRecord(requireRecord(snapshot.observation).report);
    assertCondition(selected.siteId === TEST_SITE_ID && installed.siteId === TEST_SITE_ID);
    assertCondition(selected.installationId === installed.id && report.instanceId === instanceId);
}
