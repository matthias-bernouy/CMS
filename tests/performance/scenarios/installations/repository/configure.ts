import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { settingsTenants } from "../../content/settings/tenant";
import type { QueryEnvironment } from "../../queries/execute";

export async function prepareRepositoryConfiguration(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    binding: string,
): Promise<PreparedSample> {
    const state = lease.value;
    const contract = "ulvia/cms.installations";
    const capability = "initialization.repository.configure";
    const read = () => state.fixture("initialization.repository.get", {}, contract);
    let original: Readonly<Record<string, unknown>> | undefined;
    const restore = async () => {
        try {
            if (original) {
                const current = await read();
                if (current.url !== original.url) {
                    const result = await state.client(contract, capability, "http", {
                        expectedRevision: current.revision,
                        url: original.url,
                    });
                    assertCondition(result.observation.validated);
                    assertCondition((await read()).url === original.url);
                }
            }
        } finally {
            lease.release();
        }
    };
    try {
        await state.prepare(binding);
        original = await read();
        const selections = await state.fixture("list-provider-installations", {}, contract);
        const pins = canonicalizeIJson(selections.selections);
        let input: Readonly<Record<string, unknown>> = {};
        return {
            async send() {
                // The cold restart can refresh instance metadata; read its live revision outside root timing.
                const before = await read();
                input = { expectedRevision: before.revision, url: state.session.origin };
                return (
                    await state.client(contract, capability, binding, input, (output) => {
                        const row = requireRecord(output);
                        assertCondition(row.configured === true && row.url === state.session.origin);
                        assertCondition(row.revision === Number(before.revision) + 1);
                        assertCondition(
                            row.repositoryEnabled === before.repositoryEnabled &&
                                row.creationStatus === before.creationStatus,
                        );
                    })
                ).observation;
            },
            async verify() {
                const saved = await read();
                const before = canonicalizeIJson(saved);
                const replay = await state.client(contract, capability, "http", input);
                assertCondition(replay.observation.validated && canonicalizeIJson(replay.output) === before);
                const stale = await state.client(contract, capability, "http", { ...input, url: original!.url });
                assertCondition(!stale.observation.validated && stale.observation.status === 409);
                for (const suffix of ["/path", "?token=forbidden", "#fragment"]) {
                    const invalid = await state.client(contract, capability, "http", {
                        expectedRevision: saved.revision,
                        url: state.session.origin + suffix,
                    });
                    assertCondition(!invalid.observation.validated && invalid.observation.status === 422);
                }
                const foreign = await state.client(
                    contract,
                    capability,
                    "http",
                    { ...input, expectedRevision: saved.revision },
                    undefined,
                    { httpCredentials: { cookie: environment.main.cookie } },
                );
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                assertCondition(canonicalizeIJson(await read()) === before);
                const retained = await state.fixture("list-provider-installations", {}, contract);
                assertCondition(canonicalizeIJson(retained.selections) === pins);
            },
            close: restore,
        };
    } catch (error) {
        await restore();
        throw error;
    }
}
