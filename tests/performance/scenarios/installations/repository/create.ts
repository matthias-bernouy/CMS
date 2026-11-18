import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { QueryEnvironment } from "../../queries/execute";
import type { FreshTenant } from "../fresh";

export async function prepareRepositoryCreation(
    state: FreshTenant,
    environment: QueryEnvironment,
    binding: string,
): Promise<PreparedSample> {
    const contract = "ulvia/cms.installations";
    const capability = "initialization.repository.create";
    const read = () => state.fixture("initialization.repository.get");
    try {
        const original = await read();
        assertCondition(
            original.repositoryEnabled === false && original.creationStatus === "none",
            "repository-create-original-disabled",
        );
        let input: Readonly<Record<string, unknown>> = {};
        return {
            async send() {
                await state.prepare();
                const before = await read();
                input = { expectedRevision: before.revision };
                return (
                    await state.client(contract, capability, binding, input, (output) => {
                        const row = requireRecord(output);
                        assertCondition(
                            row.configured === true &&
                                row.repositoryEnabled === true &&
                                row.creationStatus === "succeeded",
                        );
                        assertCondition(
                            row.url === state.session.origin && Number(row.revision) > Number(before.revision),
                        );
                    })
                ).observation;
            },
            async verify() {
                const saved = await read();
                assertCondition(
                    saved.repositoryEnabled === true && saved.creationStatus === "succeeded",
                    "repository-create-saved-enabled",
                );
                const info = await state.fixture("repository-info", {}, "ulvia/repository");
                assertCondition(
                    info.protocol === "ulvia-repository/v1" && info.repositoryId === state.site.instanceId,
                    "repository-create-info-identity",
                );
                const catalogue = await state.fixture(
                    "catalogue-list",
                    { kind: "collection", limit: 1 },
                    "ulvia/repository",
                );
                assertCondition(
                    Array.isArray(catalogue.releases) &&
                        catalogue.releases.length === 0 &&
                        catalogue.nextCursor === undefined,
                    "repository-create-empty-catalogue",
                );
                const replay = await state.client(contract, capability, "http", input);
                assertCondition(
                    replay.observation.validated && canonicalizeIJson(replay.output) === canonicalizeIJson(saved),
                    "repository-create-replay",
                );
                const foreign = await state.client(
                    contract,
                    capability,
                    "http",
                    { expectedRevision: saved.revision },
                    undefined,
                    { httpCredentials: { cookie: environment.main.cookie } },
                );
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "repository-create-foreign",
                );
                assertCondition(
                    canonicalizeIJson(await read()) === canonicalizeIJson(saved),
                    "repository-create-refusal-state",
                );
                const pending = await state.fixture("initialization.status");
                const collections = await state.fixture("list-collection-installations");
                assertCondition(
                    pending.status === "pending" && Array.isArray(collections.items) && collections.items.length === 0,
                    "repository-create-preserved-pending-empty",
                );
            },
            close: state.close,
        };
    } catch (error) {
        await state.close();
        throw error;
    }
}
