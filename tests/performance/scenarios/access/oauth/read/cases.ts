import { oauthReadContext } from "./context";
import { assertGrantPage, verifyGrantPages } from "./oracles";
import type { GrantEvidence } from "./oracles";
import { ClientFailure } from "../../../../harness/clients/failure";
import { oauthDocument } from "../protocol";
import { scenarioClient } from "../../../../harness/clients/session";
import { sampleScenario } from "../../../../harness/execution/samples";
import { assertCondition } from "../../../queries/types";
import type {
    CapabilityInventory,
    Obligation,
    ScenarioDefinition,
    ScenarioResult,
} from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";
import type { OAuthReadContext } from "./context";

/** A read workload prepares one bounded dataset, shared by its measured samples. */
export async function executeOAuthRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    obligation: Obligation,
    capability: string,
): Promise<ScenarioResult> {
    const context = oauthReadContext(inventory, environment);
    let result: ScenarioResult;
    try {
        await context.initialize();
        const history = obligation.variant === "history";
        const size = ["large", "history"].includes(obligation.variant) ? 128 : 1;
        const grants: GrantEvidence[] = [];
        for (let index = 0; index < size; index++) {
            const grant = await context.issue(context.owner);
            grants.push(grant);
            if (history) {
                await context.revoke(grant);
            }
        }
        if (history) {
            grants.push(await context.issue(context.owner));
        }
        const foreign = await context.issue(context.foreign);
        const selected = grants[0]!;
        const invalidation = obligation.variant === "invalidation";
        if (invalidation) {
            const first = await context.client.checked(
                context.owner,
                capability,
                capability === "list-mcp-connections" ? { limit: 25 } : { token: selected.token },
            );
            if (capability === "list-mcp-connections") {
                assertGrantPage({ resultJson: JSON.stringify(first) }, grants);
            } else {
                assertCondition(first.connectionId === selected.id && first.subjectId === context.owner.sub);
            }
            await context.revoke(selected);
        }
        const input = capability === "list-mcp-connections" ? { limit: 25 } : { token: selected.token };
        result = await sampleScenario(environment.stack, definition, obligation, async () => ({
            async send() {
                return (
                    await context.client.document(context.owner, capability, input, (output) => {
                        if (capability === "list-mcp-connections") {
                            assertGrantPage(output, grants);
                        } else {
                            assertInvalidToken(output);
                        }
                    })
                ).observation;
            },
        }));
        if (result.measurements.some((row) => row.validated)) {
            try {
                await verifyGrantPages(
                    async (input) =>
                        (await context.client.document(context.owner, "list-mcp-connections", input)).output,
                    grants,
                );
                await verifyIsolation(inventory, environment, context, selected.id, foreign.id, foreign.token);
                await verifyGrantPages(
                    async (input) =>
                        (await context.client.document(context.owner, "list-mcp-connections", input)).output,
                    grants,
                );
            } catch {
                result = invalidate(result, "oauth-read-postcondition-failed", "failed");
            }
        }
    } catch (error) {
        result = {
            scenario: definition.id,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "oauth-read-fixture-failed",
            measurements: [],
        };
    } finally {
        try {
            await context.close();
        } catch {
            result = result!
                ? invalidate(result, "oauth-read-cleanup-failed", "blocked")
                : {
                      scenario: definition.id,
                      status: "blocked",
                      failure: "oauth-read-cleanup-failed",
                      measurements: [],
                  };
        }
    }
    return result!;
}

function invalidate(result: ScenarioResult, failure: string, status: ScenarioResult["status"]): ScenarioResult {
    return {
        ...result,
        status,
        failure,
        measurements: result.measurements.map((row) => ({ ...row, validated: false, error: failure })),
    };
}

export function assertInvalidToken(output: unknown) {
    const result = oauthDocument(output);
    assertCondition(
        result.error === "invalid_token" &&
            result.status === 401 &&
            Object.keys(result).toSorted().join(",") === "error,status",
        "oauth-read-revocation-not-observed",
    );
}

async function verifyIsolation(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    context: OAuthReadContext,
    ownerId: string,
    foreignId: string,
    foreignToken: string,
) {
    const foreign = [...context.grants.values()].filter((grant) => grant.subjectId === context.foreign.sub);
    await verifyGrantPages(
        async (input) => (await context.client.document(context.foreign, "list-mcp-connections", input)).output,
        foreign,
    );
    const refused = await context.client.document(
        { ...context.owner, cookie: environment.registry.cookie },
        "list-mcp-connections",
        { limit: 25 },
        oauthDocument,
    );
    assertCondition(!refused.observation.validated && [401, 403].includes(refused.observation.status));
    const other = scenarioClient(inventory, { ...environment.main, ...environment.registry });
    const crossed = await other(
        "ulvia/cms.access",
        "resolve-mcp-connection",
        "http",
        { requestJson: JSON.stringify({ token: foreignToken }) },
        assertInvalidToken,
    );
    assertCondition(crossed.observation.validated);
    const unauthorized = await context.client.document(
        context.foreign,
        "revoke-mcp-connection",
        { id: ownerId },
        oauthDocument,
    );
    const denial = oauthDocument(unauthorized.output);
    assertCondition(unauthorized.observation.validated && denial.error === "access_denied" && denial.status === 403);
    const invalid = await context.client.document(context.owner, "list-mcp-connections", { limit: 0 }, oauthDocument);
    const badInput = oauthDocument(invalid.output);
    assertCondition(invalid.observation.validated && badInput.error === "invalid_request" && badInput.status === 400);
    const unchanged = await context.client.checked(context.foreign, "resolve-mcp-connection", { token: foreignToken });
    assertCondition(unchanged.connectionId === foreignId && unchanged.subjectId === context.foreign.sub);
}
