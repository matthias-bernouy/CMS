import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { secretFixture } from "../fixture";
import { secretReadDataset } from "./dataset";
import { assertSecretMetadataList } from "./oracles";
import { assertCondition, requireRecord } from "../../queries/types";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { Variant } from "../../../capabilities/types";

export async function prepareSecretRead(
    client: ScenarioClient,
    capability: string,
    variant: Variant,
    cleanup: (credentials: Readonly<{ namespaceId?: unknown; namespaceKey?: unknown }>, name: string) => Promise<void>,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const state = await secretFixture(client, capability);
    const foreignName = `performance-${crypto.randomUUID()}`;
    let foreign: Readonly<Record<string, unknown>> | undefined;
    const close = async () => {
        const results = await Promise.allSettled([
            cleanup(state.credentials, state.name),
            ...(foreign ? [cleanup(foreign, foreignName)] : []),
        ]);
        for (const result of results) {
            if (result.status === "rejected") {
                throw result.reason;
            }
        }
    };
    try {
        foreign = requireRecord(await state.fixture("namespace.create", { name: foreignName }));
        let input: Readonly<Record<string, unknown>> = state.input;
        let records = state.secret ? [state.secret] : [];
        let version = 1;
        let value = state.value;
        let revoked: unknown;
        let namespace: unknown;
        if (variant === "large" || variant === "history") {
            const data = await secretReadDataset(state, variant === "history");
            records = data.records;
            input = { ...data.credentials, limit: 25 };
            revoked = data.revokedKey;
        } else {
            const primed = await state.call(capability, input);
            assertCondition(primed.observation.validated);
            if (capability === "namespace.get") {
                namespace = primed.output;
                const key = requireRecord(
                    await state.fixture("namespace.keys.create", {
                        ...state.credentials,
                        permissions: ["namespace.manage"],
                    }),
                );
                const credentials = { ...state.credentials, namespaceKey: key.namespaceKey };
                assertCondition((await state.call(capability, credentials)).observation.validated);
                const next = requireRecord(
                    await state.fixture("namespace.keys.rotate", { ...state.credentials, keyId: key.keyId }),
                );
                input = { ...state.credentials, namespaceKey: next.namespaceKey };
                revoked = key.namespaceKey;
            } else {
                const updated = requireRecord(
                    await state.fixture("secrets.rotate", {
                        ...state.credentials,
                        secretId: state.secret!.secretId,
                        expectedVersion: 1,
                        value: state.rotated,
                    }),
                );
                records = [updated];
                version = 2;
                value = state.rotated;
                if (capability === "secrets.list") {
                    records.push(
                        requireRecord(
                            await state.fixture("secrets.create", {
                                ...state.credentials,
                                name: `added-${crypto.randomUUID()}`,
                                value: `private-${crypto.randomUUID()}`,
                            }),
                        ),
                    );
                }
            }
        }
        let observed: unknown;
        return {
            async send() {
                return (
                    await state.call(capability, input, (output) => {
                        observed = output;
                        if (capability === "secrets.list") {
                            assertSecretMetadataList(output, records, Number(input.limit ?? 25));
                        } else if (capability === "namespace.get") {
                            assertCondition(canonicalizeIJson(output) === canonicalizeIJson(namespace));
                        } else {
                            const out = requireRecord(output);
                            assertCondition(
                                out.namespaceId === state.credentials.namespaceId &&
                                    out.secretId === state.secret!.secretId &&
                                    out.version === version,
                            );
                            if (capability === "secrets.resolve") {
                                assertCondition(out.value === value, "secret-resolve-stale-value");
                            } else {
                                assertCondition(canonicalizeIJson(out) === canonicalizeIJson(records[0]));
                            }
                        }
                    })
                ).observation;
            },
            async verify() {
                const wrong = await state.call(capability, { ...input, namespaceKey: foreign!.namespaceKey });
                // The named reader has nullable absence and declares authorization refusal, not NOT_FOUND.
                const expectedForeignStatus = capability === "secrets.get-metadata-by-name" ? 403 : 404;
                assertCondition(
                    !wrong.observation.validated && wrong.observation.status === expectedForeignStatus,
                    `secret-cross-namespace-refusal-http-${wrong.observation.status}`,
                );
                if (revoked) {
                    const refused = await state.call(capability, { ...input, namespaceKey: revoked });
                    assertCondition(
                        !refused.observation.validated && refused.observation.status === 403,
                        "secret-revoked-key-cache",
                    );
                }
                const saved = await state.call(capability, input);
                assertCondition(
                    saved.observation.validated && canonicalizeIJson(saved.output) === canonicalizeIJson(observed),
                );
                if (capability === "secrets.list") {
                    assertSecretMetadataList(await state.fixture(capability, { ...input, limit: 100 }), records, 100);
                    await invalid(input);
                }
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
