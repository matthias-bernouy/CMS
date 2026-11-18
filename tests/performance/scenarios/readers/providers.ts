import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { ClientFailure } from "../../harness/clients/failure";
import { assertCondition, requireRecord } from "../queries/types";
import type { PreparedSample } from "../../harness/execution/samples";
import type { ReaderContext } from "./context";

export async function prepareProviderReader(
    context: ReaderContext,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const { entry, selections } = await context.provider();
    const input = { installationId: entry.id };
    const check = (value: unknown, code: string) => {
        if (!value) {
            throw new ClientFailure(code);
        }
    };
    const assert = (output: unknown) => {
        const row = requireRecord(output);
        check(row.providerId === entry.providerId && row.endpoint === entry.endpoint, "provider-reader-identity");
        check(
            row.manifestVersion === entry.manifestVersion && Number.isSafeInteger(row.revision),
            "provider-reader-manifest-revision",
        );
        if (capability === "get-provider-installation") {
            check(
                row.id === entry.id && row.accountId === entry.accountId && row.status === entry.status,
                "provider-reader-installation",
            );
            check(
                row.revision === entry.revision && Array.isArray(row.contracts),
                "provider-reader-observation-revision",
            );
            check(canonicalizeIJson(row.selections) === canonicalizeIJson(selections), "provider-reader-selections");
            assertCondition(Array.isArray(row.contracts));
            for (const selected of selections) {
                check(
                    row.contracts.some((value) => {
                        const contract = requireRecord(value);
                        return contract.contractId === selected.contractId && contract.digest === selected.digest;
                    }),
                    "provider-reader-selected-contract-missing",
                );
            }
        } else {
            assertCondition(row.installationId === entry.id && typeof row.paired === "boolean");
            assertCondition(Array.isArray(row.requests) && row.requests.length > 0);
            assertCondition(
                row.requests.every((value) => {
                    const request = requireRecord(value);
                    return typeof request.selected === "boolean" && typeof request.capabilityId === "string";
                }),
            );
        }
    };
    return {
        async send() {
            return (await context.call(capability, binding, input, assert)).observation;
        },
        async verify() {
            await context.refused(capability, { installationId: `missing-${crypto.randomUUID()}` }, [403, 404, 422]);
            assert(await context.checked(capability, input));
        },
    };
}
