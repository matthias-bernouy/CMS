import { prepareInitializationApply } from "../../initialization/actions/apply";
import { assertCondition } from "../../queries/types";
import { installationReadOracle } from "./oracle";
import type { FreshTenant } from "../fresh";
import type { QueryEnvironment } from "../../queries/execute";
import type { Dataset } from "../../initialization/datasets";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareInitializationRead(
    state: FreshTenant,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
    dataset: Dataset,
): Promise<PreparedSample> {
    let action: PreparedSample | undefined;
    try {
        const contract = "ulvia/cms.installations";
        const entry = capability === "initialization.entry";
        const before = await state.fixture(capability);
        assertCondition(
            entry ? before.pending === true : before.status === "pending",
            "installation-initialization-prime",
        );
        let completed: Readonly<Record<string, unknown>> | undefined;
        action = await prepareInitializationApply(state, environment, "http", "nominal", dataset, (output) => {
            completed = output;
        });
        assertCondition((await action.send()).validated && completed, "installation-initialization-applied");
        const expected = entry
            ? { pending: false }
            : { ...completed, operationId: "", operationStatus: "none", errorMessage: "" };
        const assert = installationReadOracle(expected);
        return {
            async send() {
                await state.prepare();
                return (await state.client(contract, capability, binding, {}, assert)).observation;
            },
            async verify() {
                await action!.verify?.();
                const foreign = await state.client(contract, capability, "http", {}, entry ? assert : undefined, {
                    httpCredentials: { cookie: entry ? "" : environment.main.cookie },
                });
                assertCondition(
                    entry
                        ? foreign.observation.validated
                        : !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "installation-initialization-public-or-private-boundary",
                );
                assert(await state.fixture(capability));
            },
            close: action.close,
        };
    } catch (error) {
        await (action?.close ?? state.close)();
        throw error;
    }
}
