import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { repositoryApi } from "../../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../../harness/clients/session";
import { registryCalls, registrySession, registryClient } from "../../client";
import { prepareRepositoryCreation } from "../../../installations/repository";
import { collectionPublicationFixture } from "../../publication/collection-fixture";
import { assertCondition, requireRecord } from "../../../queries/types";
import { buildReadSources } from "./workload";
import type { freshTenants } from "../../../installations/fresh";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";
import type { PreparedSample } from "../../../../harness/execution/samples";
import type { ScenarioSession } from "../../../../harness/clients/session";

export async function buildIsolation(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    fresh: ReturnType<typeof freshTenants>,
) {
    const site = await fresh(environment, "http", false);
    const creation = await prepareRepositoryCreation(site, environment, "http");
    try {
        assertCondition((await creation.send()).validated, "registry-build-isolation-activation");
        const actor = await repositoryApi(site.session.origin).signup(
            `performance-build-${randomUUID()}@performance.test`,
            `Fixture-${randomUUID()}!`,
        );
        const calls = registryCalls(scenarioClient(inventory, registrySession(site.session.origin, actor.cookie)));
        return { calls, close: creation.close };
    } catch (error) {
        await creation.close?.();
        throw error;
    }
}

export async function prepareBuildRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    other: Awaited<ReturnType<typeof buildIsolation>>,
    invalid: (input: Readonly<Record<string, unknown>>, session: ScenarioSession) => Promise<void>,
): Promise<PreparedSample> {
    const state = await collectionPublicationFixture(inventory, environment, "publication-build", buildReadSources);
    let input: Readonly<Record<string, unknown>> | undefined;
    let pending = false;
    const completed = await state.call("publication-build", "http", state.uploadScope, undefined, {
        idempotencyKey: randomUUID(),
        async complete(operationId, signal, recordPoll) {
            input = { ...state.uploadScope, operationId };
            const prime = await state.call("publication-build-status", "http", input, (value) => {
                const row = requireRecord(value);
                assertCondition(
                    row.operationId === operationId && ["queued", "running", "succeeded"].includes(String(row.status)),
                    "registry-build-prime-state",
                );
                pending = ["queued", "running"].includes(String(row.status));
            });
            assertCondition(prime.observation.validated, "registry-build-prime");
            return state.complete(operationId, signal, recordPoll);
        },
    });
    assertCondition(
        completed.observation.validated && input && pending,
        "registry-build-pending-to-terminal-precondition",
    );
    const receipt = requireRecord(completed.output);
    assertCondition(
        receipt.digest === state.resource.digest && receipt.added === true && receipt.kind === "collection",
        "registry-build-durable-result",
    );
    const selected = input;
    const assert = (value: unknown) => {
        const row = requireRecord(value);
        assertCondition(
            row.operationId === selected.operationId &&
                row.status === "succeeded" &&
                canonicalizeIJson(row.result) === canonicalizeIJson(receipt) &&
                Object.keys(row).toSorted().join(",") === "operationId,result,status",
            "registry-build-status-projection",
        );
    };
    const claim = await other.calls.fixture("namespace-claim", { namespace: state.uploadScope.namespace });
    assertCondition(claim.revision === state.uploadScope.namespaceRevision, "registry-build-isolation-namespace");
    return {
        async send() {
            return (await state.call("publication-build-status", "http", selected, assert)).observation;
        },
        async verify() {
            const foreign = registryCalls(registryClient(inventory, environment));
            const denied = await foreign.call("publication-build-status", "http", selected);
            const elsewhere = await other.calls.call("publication-build-status", "http", selected);
            const wrong = await state.call("publication-build-status", "http", {
                ...selected,
                operationId: randomUUID(),
            });
            await invalid(selected, state.session);
            const saved = await state.call("publication-build-status", "http", selected, assert);
            assertCondition(saved.observation.validated, "registry-build-refusal-mutated-state");
            const statuses = {
                foreignAccount: denied.observation.status,
                crossInstance: elsewhere.observation.status,
                missingOperation: wrong.observation.status,
            };
            if (
                statuses.foreignAccount !== 409 ||
                statuses.crossInstance !== 404 ||
                statuses.missingOperation !== 404
            ) {
                console.log(`Repository build isolation refusal statuses: ${JSON.stringify(statuses)}`);
            }
            assertCondition(
                !denied.observation.validated && statuses.foreignAccount === 409,
                `registry-build-foreign-account-http-${statuses.foreignAccount}`,
            );
            assertCondition(
                !elsewhere.observation.validated && statuses.crossInstance === 404,
                `registry-build-cross-instance-http-${statuses.crossInstance}`,
            );
            assertCondition(
                !wrong.observation.validated && statuses.missingOperation === 404,
                `registry-build-wrong-operation-http-${statuses.missingOperation}`,
            );
        },
    };
}
