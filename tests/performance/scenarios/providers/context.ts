import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { readProviderCredential } from "../../../integration/instance/providers/credentials";
import { ClientFailure } from "../../harness/clients/failure";
import { assertCondition, requireRecord } from "../queries/types";
import type { ProviderPeer } from "./peer";
import type { settingsTenants } from "../content/settings/tenant";
import type { QueryEnvironment } from "../queries/execute";
import { assertApprovalStateUnchanged } from "./oracles";
import { loopbackProviderClient } from "./technical/return-client";

export const INSTALLATIONS = "ulvia/cms.installations";
export const json = canonicalizeIJson;

export async function providerContext(
    environment: QueryEnvironment,
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    peer: ProviderPeer,
    binding: string,
) {
    const state = lease.value;
    try {
        await state.prepare(binding);
        const call = (
            capability: string,
            input: Readonly<Record<string, unknown>>,
            assert?: (output: unknown) => void,
            transport = "http",
        ) => state.client(INSTALLATIONS, capability, transport, input, assert);
        const checked = async (capability: string, input: Readonly<Record<string, unknown>> = {}) => {
            const result = await call(capability, input);
            if (!result.observation.validated) {
                throw new ClientFailure(`provider-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
            }
            return requireRecord(result.output);
        };
        const snapshot = () => checked("list-provider-installations");
        const original = await snapshot();
        const imported = await checked("import-provider-manifest", peer.pin);
        assertCondition(imported.digest === peer.digest);
        assertApprovalStateUnchanged(original, await snapshot());
        const find = async () => {
            const current = await snapshot();
            assertCondition(Array.isArray(current.installations));
            return current.installations
                .map(requireRecord)
                .find((row) => row.accountId === peer.report.account.id && row.providerId === peer.report.providerId);
        };
        const previewInput = (entry?: Readonly<Record<string, unknown>>) => ({
            providerId: peer.manifest.providerId,
            version: peer.manifest.version,
            endpoint: peer.endpoint,
            token: peer.token,
            ...(entry ? { installationId: entry.id, revision: entry.revision } : {}),
        });
        const ensure = async () => {
            let entry = await find();
            if (!entry) {
                const preview = await checked("preview-provider-connection", previewInput());
                const saved = await checked("approve-provider-connection", { ticket: preview.ticket });
                entry = await find();
                assertCondition(entry && entry.id === saved.installationId);
            }
            assertCondition(entry.status === "enabled", "provider-fixture-remote-installation-disabled");
            return entry;
        };
        const credential = (installationId: string) =>
            readProviderCredential(environment.stack.providerName, `${environment.stack.id}-named`, installationId);
        const append = async (token: string) => {
            const client = loopbackProviderClient(state.session.origin, token);
            return client.invoke(
                peer.logs,
                "logs.append",
                {
                    entries: [
                        {
                            id: crypto.randomUUID(),
                            time: new Date().toISOString(),
                            level: "info",
                            event: "performance.provider-pair",
                            attributes: {},
                        },
                    ],
                },
                { authority: "provider" },
            );
        };
        const deniedAppend = async (token: string) => {
            let refused = false;
            try {
                await append(token);
            } catch (error) {
                refused = requireRecord(error).status === 403;
            }
            assertCondition(refused);
        };
        const foreign = async (capability: string, input: Readonly<Record<string, unknown>>) => {
            const result = await state.client(INSTALLATIONS, capability, "http", input, undefined, {
                httpCredentials: { cookie: environment.main.cookie },
            });
            assertCondition(
                !result.observation.validated && [401, 403].includes(result.observation.status),
                `provider-foreign-http-status-${result.observation.status}`,
            );
        };
        return {
            state,
            peer,
            call,
            checked,
            snapshot,
            original,
            find,
            previewInput,
            ensure,
            credential,
            append,
            deniedAppend,
            foreign,
            close: async () => lease.release(),
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}

export type ProviderContext = Awaited<ReturnType<typeof providerContext>>;
