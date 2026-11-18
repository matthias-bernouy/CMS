import { scenarioClient } from "../../../../../harness/clients/session";
import { expectBodyRefusal } from "../../../../../harness/clients/refusal";
import { assertCondition } from "../../../../queries/types";
import { assertInstalledRows, assertInstalledDetail } from "./installed";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../queries/execute";
import type { CollectionReadState } from "../context/types";

export async function verifyCollectionReadBoundary(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    state: CollectionReadState,
    capability: string,
    input: Readonly<Record<string, unknown>>,
) {
    const foreign = await state.tenant.client("ulvia/cms.installations", capability, "http", input, undefined, {
        httpCredentials: { cookie: environment.main.cookie },
    });
    assertCondition(
        !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
        `collection-read-foreign-session-http-${foreign.observation.status}`,
    );
    const target = inventory.targets.find(
        (row) =>
            !row.retained && row.release.contractId === "ulvia/cms.installations" && row.definition.id === capability,
    )!;
    const binding = target.definition.bindings.find((row) => row.id === "http")!;
    if (binding.transport === "http" && binding.input?.body === true) {
        await expectBodyRefusal(
            inventory,
            state.tenant.session,
            "ulvia/cms.installations",
            capability,
            input,
            { ...input, unexpectedPerformanceField: true },
            400,
        );
    }
    if (["get-collection-details", "get-collection-installation"].includes(capability)) {
        const other = await scenarioClient(inventory, environment.main)(
            "ulvia/cms.installations",
            capability,
            "http",
            input,
        );
        assertCondition(
            !other.observation.validated && other.observation.status === 404,
            `collection-read-cross-instance-http-${other.observation.status}`,
        );
        const missing = await state.tenant.client("ulvia/cms.installations", capability, "http", {
            collectionId: `${state.namespace}/missing`,
        });
        assertCondition(
            !missing.observation.validated && missing.observation.status === 404,
            "collection-read-missing-installed-identity",
        );
    }
    assertInstalledRows(await state.tenant.fixture("list-collection-installations"), state);
    assertInstalledDetail(
        await state.tenant.fixture("get-collection-details", { collectionId: state.resources[0]!.id }),
        state,
    );
}
