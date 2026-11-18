import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { settingsTenants } from "../tenant";
import { settingsReadChange } from "./change";
import type { PreparedSample } from "../../../../harness/execution/samples";
import type { QueryEnvironment } from "../../../queries/execute";

type Lease = Awaited<ReturnType<ReturnType<typeof settingsTenants>>>;
type ReadLease = Readonly<{
    value: Pick<Lease["value"], "prepare" | "fixture" | "client"> & { resource: Readonly<{ id: string }> };
    release: () => void;
}>;
export const SETTINGS_READERS = [
    "site.get",
    "localization.get",
    "localization.texts.get",
    "localization.texts.read",
    "theme.get",
    "theme.read",
] as const;

/** Prime the selected reader, mutate through the admitted command, then time only its refreshed read. */
export async function prepareSettingsRead(
    lease: ReadLease,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const state = lease.value;
    try {
        await state.prepare(binding);
        const input = capability.startsWith("theme.")
            ? { collectionId: state.resource.id, mode: "light" }
            : capability.startsWith("localization.texts.")
              ? { collectionId: state.resource.id, locale: "en" }
              : {};
        const before = await state.fixture(capability, input);
        const change = settingsReadChange(capability, before, state.resource.id);
        const changed = await state.client("ulvia/cms.content", change.capability, "http", change.input);
        assertCondition(changed.observation.validated, "settings-read-mutation-failed");
        assertCondition(
            requireRecord(changed.output).revision === Number(before.revision) + 1,
            "settings-read-mutation-revision",
        );
        let saved: unknown;
        return {
            async send() {
                return (
                    await state.client("ulvia/cms.content", capability, binding, input, (output) => {
                        change.assert(output);
                        saved = output;
                    })
                ).observation;
            },
            async verify() {
                const foreign = await state.client("ulvia/cms.content", capability, "http", input, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                });
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "settings-read-foreign-session",
                );
                const stale = await state.client("ulvia/cms.content", change.capability, "http", change.input);
                assertCondition(
                    !stale.observation.validated && stale.observation.status === 409,
                    "settings-read-stale-write",
                );
                const current = await state.fixture(capability, input);
                change.assert(current);
                assertCondition(
                    canonicalizeIJson(current) === canonicalizeIJson(saved),
                    "settings-read-refusal-mutated-state",
                );
            },
            close: async () => lease.release(),
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}
