import { prepareRepositoryConfiguration } from "../repository";
import { assertCondition } from "../../queries/types";
import { installationReadOracle } from "./oracle";
import type { settingsTenants } from "../../content/settings/tenant";
import type { QueryEnvironment } from "../../queries/execute";
import type { PreparedSample } from "../../../harness/execution/samples";

/** Prime the old settings, change the actual configured origin, then measure the reader. */
export async function prepareRepositorySettingsRead(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    binding: string,
): Promise<PreparedSample> {
    const state = lease.value;
    let mutation: PreparedSample | undefined;
    try {
        await state.prepare(binding);
        const contract = "ulvia/cms.installations";
        const capability = "initialization.repository.get";
        const before = await state.fixture(capability, {}, contract);
        assertCondition(before.url !== state.session.origin, "installation-repository-distinct-origin");
        mutation = await prepareRepositoryConfiguration(lease, environment, "http");
        const changed = await mutation.send();
        assertCondition(changed.validated, "installation-repository-settings-mutation");
        const expected = {
            ...before,
            configured: true,
            url: state.session.origin,
            revision: Number(before.revision) + 1,
        };
        const assert = installationReadOracle(expected);
        return {
            async send() {
                return (await state.client(contract, capability, binding, {}, assert)).observation;
            },
            async verify() {
                await mutation!.verify?.();
                const foreign = await state.client(contract, capability, "http", {}, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                });
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "installation-repository-reader-foreign",
                );
                assert(await state.fixture(capability, {}, contract));
            },
            close: mutation.close,
        };
    } catch (error) {
        if (mutation) {
            await mutation.close?.();
        } else {
            lease.release();
        }
        throw error;
    }
}
