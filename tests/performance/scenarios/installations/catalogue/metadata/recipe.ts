import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { readProviderCredential } from "../../../../../integration/instance/providers/credentials";
import { scenarioClient } from "../../../../harness/clients/session";
import { gatewayContext, gatewayRoute } from "../../../gateway/context";
import { metadataFixtureScope } from "../state/scope";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { MetadataContext } from "../state/context";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { PreparedSample } from "../../../../harness/execution/samples";

export function describeMetadataOracle(state: MetadataContext) {
    const resource = state.resources.latestContract();
    const expected = {
        found: true,
        version: resource.version,
        capabilities: resource.admission.release.capabilities.map((capability) => ({
            id: capability.id,
            access: capability.access,
            effect: capability.behavior.effect,
            sensitive: capability.behavior.sensitive,
            ...(capability.docs ? { docs: capability.docs } : {}),
        })),
    };
    return (output: unknown) =>
        assertCondition(
            canonicalizeIJson(output) === canonicalizeIJson(expected),
            "metadata-describe-selected-release",
        );
}

export function routeMetadataOracle(state: MetadataContext) {
    const resource = state.resources.latestContract();
    const connection = state.connections.rows.get(0)!;
    return (output: unknown) => {
        const route = gatewayRoute(output);
        const selected = requireRecord(route.selection);
        const snapshot = requireRecord(route.installation);
        const installed = requireRecord(snapshot.installation);
        const report = requireRecord(requireRecord(snapshot.observation).report);
        const requested = requireRecord(requireRecord(route.requestedRelease).admission);
        const release = requireRecord(requested.release);
        assertCondition(
            selected.siteId === "default" &&
                installed.siteId === "default" &&
                selected.contractId === resource.id &&
                selected.installationId === connection.id &&
                installed.id === connection.id,
            "metadata-route-owned-selection",
        );
        assertCondition(
            selected.version === resource.version &&
                selected.digest === resource.digest &&
                requested.digest === resource.digest &&
                release.contractId === resource.id &&
                release.version === resource.version,
            "metadata-route-current-pin",
        );
        assertCondition(
            report.instanceId === connection.instanceId &&
                requireRecord(report.account).id === connection.accountId &&
                report.providerId === connection.providerId &&
                installed.status === "enabled" &&
                snapshot.revision === connection.revision,
            "metadata-route-exact-approved-observation",
        );
    };
}

export async function prepareMetadataInvalidation(
    inventory: CapabilityInventory,
    state: MetadataContext,
    capability: string,
): Promise<PreparedSample> {
    const resource = state.resources.latestContract();
    const input = { contractId: resource.id };
    const describing = capability === "capabilities.describe";
    const makeGateway = async () => {
        const key = metadataFixtureScope(state.environment.stack, state.tenant.site, state.environment.main.origin);
        const credentials = await readProviderCredential(
            state.environment.stack.providerName,
            key,
            undefined,
            state.tenant.site.instanceId,
        );
        assertCondition(typeof credentials.controlToken === "string", "metadata-route-owned-control-token");
        return gatewayContext(inventory, {
            ...state.environment,
            main: state.tenant.session,
            stack: {
                ...state.environment.stack,
                instanceId: state.tenant.site.instanceId,
                providerControl: {
                    origin: state.environment.stack.providerControl!.origin,
                    token: credentials.controlToken,
                },
            },
        });
    };
    const gateway = describing ? undefined : await makeGateway();
    if (gateway) {
        await state.refreshSelectedObservation();
    }
    const prime = describing
        ? await state.tenant.client("ulvia/cms.installations", capability, "http", input, describeMetadataOracle(state))
        : await gateway!.call(capability, input, routeMetadataOracle(state));
    assertCondition(prime.observation.validated, "metadata-selected-old-release-prime");
    await state.mutateDocumentation();
    if (gateway) {
        await state.refreshSelectedObservation();
    }
    const oracle = describing ? describeMetadataOracle(state) : routeMetadataOracle(state);
    const before = canonicalizeIJson({
        revision: state.connections.revision,
        selections: state.connections.selections,
    });
    return {
        async send() {
            return (
                describing
                    ? await state.tenant.client("ulvia/cms.installations", capability, "http", input, oracle)
                    : await gateway!.call(capability, input, oracle)
            ).observation;
        },
        async verify() {
            if (describing) {
                const foreign = await state.tenant.client(
                    "ulvia/cms.installations",
                    capability,
                    "http",
                    input,
                    undefined,
                    { httpCredentials: { cookie: state.environment.main.cookie } },
                );
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "metadata-describe-foreign-session",
                );
                const elsewhere = await scenarioClient(inventory, state.environment.main)(
                    "ulvia/cms.installations",
                    capability,
                    "http",
                    input,
                    (output) =>
                        assertCondition(
                            canonicalizeIJson(output) ===
                                canonicalizeIJson({ found: false, version: "", capabilities: [] }),
                            "metadata-describe-cross-instance-empty",
                        ),
                );
                assertCondition(elsewhere.observation.validated, "metadata-describe-cross-instance");
            } else {
                await gateway!.unauthorized(capability, input);
                await (await gatewayContext(inventory, state.environment)).refused(capability, input, [404]);
                oracle(await gateway!.checked(capability, input));
            }
            assertCondition(
                canonicalizeIJson({
                    revision: state.connections.revision,
                    selections: state.connections.selections,
                }) === before,
                "metadata-selected-refusals-preserve-state",
            );
        },
    };
}
