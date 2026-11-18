import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { namespaceReadContext } from "./context";
import { assertAuthoringPage, assertNamespaceList, namespaceEvidence, verifyNamespacePages } from "./oracles";
import { assertCondition } from "../../queries/types";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { ClientFailure } from "../../../harness/clients/failure";
import { sampleScenario } from "../../../harness/execution/samples";
import type { CapabilityInventory, Obligation, ScenarioDefinition, ScenarioResult } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { NamespaceReadContext } from "./context";

/** One owned dataset per scenario exercises the actual 32-name quota, not an enlarged test-only quota. */
export async function executeNamespaceRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    obligation: Obligation,
    capability: string,
) {
    const authoring = capability === "list-namespaces";
    const context = namespaceReadContext(inventory, environment, authoring);
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "namespace-read-preparation-failed",
        measurements: [],
    };
    try {
        await context.initialize(obligation.variant);
        const read = () =>
            authoring
                ? context.main("ulvia/cms.authoring", capability, obligation.binding, { limit: 8 }, (output) => {
                      assertAuthoringPage(output, context.expected, context.repositoryId, context.startedAt);
                  })
                : context.owner.call(
                      capability,
                      obligation.binding,
                      capability === "namespace-get" ? { namespace: context.expected[0]!.namespace } : {},
                      (output) => {
                          if (capability === "namespace-get") {
                              assertCondition(
                                  canonicalizeIJson(namespaceEvidence(output)) ===
                                      canonicalizeIJson(context.expected[0]),
                                  "namespace-read-stale-public-state",
                              );
                          } else {
                              assertNamespaceList(output, context.expected);
                          }
                      },
                  );
        if (obligation.variant === "invalidation") {
            assertCondition((await read()).observation.validated, "namespace-read-prime-failed");
            await context.suspend(0);
        }
        result = await sampleScenario(environment.stack, definition, obligation, async () => ({
            send: async () => (await read()).observation,
        }));
        if (result.measurements.some((row) => row.validated)) {
            await verifyNamespaces(inventory, environment, context, authoring);
        }
    } catch (error) {
        result = {
            ...result,
            status: result.measurements.length ? "failed" : "blocked",
            failure:
                error instanceof ClientFailure
                    ? error.code
                    : result.measurements.length
                      ? "namespace-read-postcondition-failed"
                      : "namespace-read-preparation-failed",
        };
    } finally {
        try {
            await context.close();
        } catch {
            result = { ...result, status: "blocked", failure: "namespace-read-restore-failed" };
        }
    }
    return result;
}

async function verifyNamespaces(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    context: NamespaceReadContext,
    authoring: boolean,
) {
    if (authoring) {
        await verifyNamespacePages(
            async (input) => {
                const result = await context.main("ulvia/cms.authoring", "list-namespaces", "http", input);
                assertCondition(result.observation.validated);
                return result.output;
            },
            context.expected,
            context.repositoryId,
            context.startedAt,
        );
        await expectBodyRefusal(
            inventory,
            environment.main,
            "ulvia/cms.authoring",
            "list-namespaces",
            { limit: 8 },
            { limit: 0 },
            400,
        );
        const refused = await context.main("ulvia/cms.authoring", "list-namespaces", "http", { limit: 8 }, undefined, {
            httpCredentials: { cookie: environment.registry.cookie },
        });
        assertCondition(!refused.observation.validated && [401, 403].includes(refused.observation.status));
    }
    assertNamespaceList(await context.foreign.fixture("namespace-list", {}), [context.foreignNamespace]);
    const first = context.expected[0]!;
    const denied = await context.foreign.call("namespace-suspend", "http", {
        namespace: first.namespace,
        namespaceRevision: first.revision,
    });
    assertCondition(
        !denied.observation.validated && denied.observation.status === 409,
        "namespace-read-foreign-owner-mutated",
    );
    assertNamespaceList(await context.owner.fixture("namespace-list", {}), context.expected);
    for (const expected of context.expected) {
        const saved = namespaceEvidence(
            await context.owner.fixture("namespace-get", { namespace: expected.namespace }),
        );
        assertCondition(
            canonicalizeIJson(saved) === canonicalizeIJson(expected),
            "namespace-read-refusal-changed-state",
        );
    }
}
