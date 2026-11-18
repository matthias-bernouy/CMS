import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { scenarioClient } from "../../../../harness/clients/session";
import { registryCalls, registrySession } from "../../client";
import { prepareRepositoryCreation } from "../../../installations/repository";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { freshTenants } from "../../../installations/fresh";
import type { QueryEnvironment } from "../../../queries/execute";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { PreparedSample } from "../../../../harness/execution/samples";

/** A real newly enabled Registry invalidates an unavailable route; immutable identities remain instance-specific. */
export async function prepareRegistryIdentity(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    fresh: ReturnType<typeof freshTenants>,
): Promise<PreparedSample> {
    const site = await fresh(environment, "http", false);
    const creation = await prepareRepositoryCreation(site, environment, "http");
    const parent = registryCalls(scenarioClient(inventory, registrySession(environment.registry.origin, "")));
    const read = registryCalls(scenarioClient(inventory, { ...site.session, cookie: "" }));
    try {
        const original = await parent.fixture("repository-info", {});
        const absent = await read.call("repository-info", "http", {});
        assertCondition(
            !absent.observation.validated && [404, 422].includes(absent.observation.status),
            "registry-identity-unavailable-prime",
        );
        assertCondition((await creation.send()).validated, "registry-identity-activation");
        const expected = { protocol: "ulvia-repository/v1", repositoryId: site.site.instanceId };
        return {
            async send() {
                return (
                    await read.call("repository-info", "http", {}, (value) =>
                        assertCondition(
                            canonicalizeIJson(value) === canonicalizeIJson(expected),
                            "registry-identity-instance-cache-key",
                        ),
                    )
                ).observation;
            },
            async verify() {
                await creation.verify?.();
                const unchanged = await parent.fixture("repository-info", {});
                assertCondition(
                    canonicalizeIJson(original) === canonicalizeIJson(unchanged) &&
                        requireRecord(unchanged).repositoryId !== expected.repositoryId,
                    "registry-identity-parent-changed",
                );
            },
            close: creation.close,
        };
    } catch (error) {
        await creation.close?.();
        throw error;
    }
}
