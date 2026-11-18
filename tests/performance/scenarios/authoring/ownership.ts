import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../integration/instance/repository/client";
import { scenarioClient } from "../../harness/clients/session";
import { assertCondition, requireRecord } from "../queries/types";
import type { CapabilityInventory, ScenarioResult } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";

/** One fresh publisher per scenario keeps valid claims below the real 32-namespace account quota. */
export async function withClaimPublisher(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    scenario: string,
    execute: (environment: QueryEnvironment) => Promise<ScenarioResult>,
) {
    const original = environment.registry.publicationToken;
    assertCondition(typeof original === "string" && original.length > 0);
    const api = repositoryApi(environment.registry.origin);
    const suffix = randomUUID();
    const client = scenarioClient(inventory, environment.main);
    const configure = async (token: string) => {
        const result = await client("ulvia/cms.authoring", "configure-connection", "http", { token });
        assertCondition(result.observation.validated && requireRecord(result.output).configured === true);
    };
    let result: ScenarioResult = {
        scenario,
        status: "blocked",
        failure: "Claim publisher fixture setup failed",
        measurements: [],
    };
    try {
        const account = await api.signup(
            `performance-publisher-${suffix}@performance.test`,
            `Fixture-${randomUUID()}!`,
        );
        const pat = await api.pat(account.cookie);
        await configure(pat.token);
        result = await execute(environment);
    } catch {
        result = { ...result, status: "blocked", failure: "Claim publisher fixture failed" };
    } finally {
        try {
            await configure(original);
        } catch {
            result = { ...result, status: "blocked", failure: "Original publisher fixture could not be restored" };
        }
        // These test-owned reservations intentionally survive until the isolated
        // stack is removed. Account deletion would violate ownership fencing.
    }
    return result;
}
