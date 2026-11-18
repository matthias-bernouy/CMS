import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import { collectionTarget } from "./resources";
import type { PreparedSample } from "../../harness/execution/samples";
import type { settingsTenants } from "../content/settings/tenant";
import type { QueryEnvironment } from "../queries/execute";
import type { publicationCollection } from "../repository/resources/collection";

export const COLLECTION_MUTATIONS = [
    "install-collection",
    "install-collections",
    "configure-collection",
    "update-collection-configuration",
] as const;

export async function prepareCollectionMutation(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    resource: Awaited<ReturnType<typeof publicationCollection>>,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const state = lease.value;
    try {
        await state.prepare(binding);
        const contract = "ulvia/cms.installations";
        const installing = capability.startsWith("install-");
        const target = await collectionTarget(state, resource);
        const list = () => state.fixture("list-collection-installations", {}, contract);
        const detail = () => state.fixture("get-collection-details", { collectionId: resource.id }, contract);
        if (!installing) {
            const before = await list();
            const installed = await state.client(contract, "install-collection", "http", {
                expectedRevision: before.revision,
                targets: [target],
            });
            assertCondition(installed.observation.validated);
            assertCondition(
                canonicalizeIJson(JSON.parse(String((await detail()).configurationJson))) ===
                    canonicalizeIJson({ title: "Default" }),
            );
        }
        const before = await list();
        const marker = `Configured ${crypto.randomUUID()}`;
        const input = installing
            ? { expectedRevision: before.revision, targets: [target] }
            : {
                  collectionId: resource.id,
                  expectedRevision: before.revision,
                  configurationJson: JSON.stringify({ title: marker }),
              };
        return {
            async send() {
                return (
                    await state.client(contract, capability, binding, input, (output) => {
                        const row = requireRecord(output);
                        assertCondition(row.revision === Number(before.revision) + 1 && Array.isArray(row.items));
                        const item = row.items.map(requireRecord).find((entry) => entry.collectionId === resource.id);
                        assertCondition(
                            item &&
                                item.digest === resource.digest &&
                                item.version === resource.version &&
                                item.configurable === true,
                        );
                    })
                ).observation;
            },
            async verify() {
                const saved = await detail();
                assertCondition(
                    saved.revision === Number(before.revision) + 1 && saved.digest === resource.digest,
                    "collection-mutation-durable-pin-revision",
                );
                assertCondition(
                    canonicalizeIJson(JSON.parse(String(saved.configurationJson))) ===
                        canonicalizeIJson({ title: installing ? "Default" : marker }),
                    "collection-mutation-durable-configuration",
                );
                const installed = await list();
                const unchanged = canonicalizeIJson({ installed, saved });
                const stale = await state.client(contract, capability, "http", input);
                assertCondition(
                    !stale.observation.validated && stale.observation.status === 409,
                    `collection-mutation-stale-http-status-${stale.observation.status}`,
                );
                const invalid = installing
                    ? {
                          expectedRevision: installed.revision,
                          targets: [{ ...target, digest: `sha256:${"0".repeat(64)}` }],
                      }
                    : {
                          ...input,
                          expectedRevision: installed.revision,
                          configurationJson: JSON.stringify({ title: 42 }),
                      };
                const refused = await state.client(contract, capability, "http", invalid);
                assertCondition(
                    !refused.observation.validated && refused.observation.status === (installing ? 404 : 422),
                    `collection-mutation-invalid-http-status-${refused.observation.status}`,
                );
                const foreign = await state.client(
                    contract,
                    capability,
                    "http",
                    { ...input, expectedRevision: installed.revision },
                    undefined,
                    { httpCredentials: { cookie: environment.main.cookie } },
                );
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    `collection-mutation-foreign-http-status-${foreign.observation.status}`,
                );
                if (installing) {
                    const duplicate = await state.client(contract, capability, "http", {
                        ...input,
                        expectedRevision: installed.revision,
                    });
                    assertCondition(
                        !duplicate.observation.validated && duplicate.observation.status === 409,
                        `collection-mutation-duplicate-http-status-${duplicate.observation.status}`,
                    );
                }
                assertCondition(
                    canonicalizeIJson({ installed: await list(), saved: await detail() }) === unchanged,
                    "collection-mutation-refusal-changed-state",
                );
            },
            async close() {
                lease.release();
            },
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}
