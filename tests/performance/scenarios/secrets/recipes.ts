import { assertCondition, requireRecord } from "../queries/types";
import { secretFixture } from "./fixture";
import type { ScenarioClient } from "../../harness/clients/session";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareSecret(
    client: ScenarioClient,
    capability: string,
    cleanup: (credentials: Readonly<{ namespaceId?: unknown; namespaceKey?: unknown }>, name: string) => Promise<void>,
): Promise<PreparedSample> {
    const state = await secretFixture(client, capability);
    let result: unknown;
    let completed = false;
    const object = () => requireRecord(result);
    return {
        async send() {
            const response = await state.call(capability, state.input, (output) => {
                result = output;
                if (["namespace.delete", "namespace.keys.revoke"].includes(capability)) {
                    assertCondition(output === null);
                } else {
                    const out = object();
                    if (["namespace.create", "namespace.keys.create", "namespace.keys.rotate"].includes(capability)) {
                        assertCondition(typeof out.namespaceKey === "string" && typeof out.keyId === "string");
                    }
                    if (capability === "namespace.create") {
                        assertCondition(typeof out.namespaceId === "string");
                    }
                    if (capability === "namespace.get") {
                        assertCondition(out.id === state.namespace!.namespaceId && out.name === state.name);
                    }
                    if (capability.startsWith("secrets.") && !["secrets.list", "secrets.delete"].includes(capability)) {
                        assertCondition(
                            out.namespaceId === state.credentials.namespaceId && typeof out.secretId === "string",
                        );
                    }
                    if (
                        ["secrets.create", "secrets.get-metadata", "secrets.get-metadata-by-name"].includes(capability)
                    ) {
                        assertCondition(out.name === state.name && out.version === 1);
                    }
                    if (capability === "secrets.resolve") {
                        assertCondition(out.value === state.value && out.version === 1);
                    }
                    if (capability === "secrets.rotate") {
                        assertCondition(out.version === 2 && out.secretId === state.secret!.secretId);
                    }
                    if (capability === "secrets.delete") {
                        assertCondition(out.deleted === true);
                    }
                    if (capability === "secrets.list") {
                        assertCondition(
                            Array.isArray(out.items) &&
                                out.items.some((item) => item.secretId === state.secret!.secretId),
                        );
                    }
                }
            });
            completed = response.observation.validated;
            return response.observation;
        },
        async verify() {
            if (capability === "namespace.delete") {
                const denied = await state.call("namespace.get", state.credentials);
                assertCondition([403, 404].includes(denied.observation.status));
            } else if (capability === "namespace.keys.revoke" || capability === "namespace.keys.rotate") {
                const denied = await state.call("namespace.get", {
                    ...state.credentials,
                    namespaceKey: state.key!.namespaceKey,
                });
                assertCondition([403, 404].includes(denied.observation.status));
                if (capability === "namespace.keys.rotate") {
                    const accepted = await state.fixture("namespace.get", {
                        ...state.credentials,
                        namespaceKey: object().namespaceKey,
                    });
                    assertCondition(requireRecord(accepted).id === state.namespace!.namespaceId);
                }
            } else if (capability === "secrets.create" || capability === "secrets.rotate") {
                const stored = requireRecord(
                    await state.fixture("secrets.resolve", { ...state.credentials, secretId: object().secretId }),
                );
                assertCondition(stored.value === (capability === "secrets.rotate" ? state.rotated : state.value));
            } else if (capability === "secrets.delete") {
                const denied = await state.call("secrets.get-metadata", {
                    ...state.credentials,
                    secretId: state.secret!.secretId,
                });
                assertCondition(denied.observation.status === 404);
            } else if (capability === "namespace.create") {
                const stored = requireRecord(
                    await state.fixture("namespace.get", {
                        namespaceId: object().namespaceId,
                        namespaceKey: object().namespaceKey,
                    }),
                );
                assertCondition(stored.name === state.name);
            }
        },
        async close() {
            if (capability === "namespace.delete" && completed) {
                return;
            }
            const credentials =
                capability === "namespace.create" && completed
                    ? { namespaceId: object().namespaceId, namespaceKey: object().namespaceKey }
                    : state.credentials;
            if (credentials.namespaceId) {
                await cleanup(credentials, state.name);
            }
        },
    };
}
