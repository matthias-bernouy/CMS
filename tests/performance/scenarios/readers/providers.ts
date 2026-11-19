import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { ClientFailure } from "../../harness/clients/failure";
import { assertCondition, requireRecord } from "../queries/types";
import type { PreparedSample } from "../../harness/execution/samples";
import type { ReaderContext } from "./context";

type ProviderReaderContext = Pick<ReaderContext, "provider" | "call" | "checked" | "refused">;

export async function prepareProviderReader(
    context: ProviderReaderContext,
    capability: string,
    binding: string,
    variant = "nominal",
): Promise<PreparedSample> {
    const { entry, selections } = await context.provider();
    const input = { installationId: entry.id };
    let expectedRevision = entry.revision;
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
                row.revision === expectedRevision && Array.isArray(row.contracts),
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
        ...(variant === "cold" && capability === "get-provider-installation"
            ? {
                  async beforeMeasure() {
                      // The lifecycle wrapper restarts first. This separate reader does not prime the measured target.
                      const current = await context.provider();
                      const identity = ["id", "providerId", "accountId", "endpoint", "status", "manifestVersion"];
                      assertCondition(
                          identity.every((field) => current.entry[field] === entry[field]),
                          "provider-reader-cold-identity",
                      );
                      assertCondition(
                          canonicalizeIJson(current.selections) === canonicalizeIJson(selections),
                          "provider-reader-cold-selections",
                      );
                      assertCondition(
                          Number.isSafeInteger(current.entry.revision) &&
                              Number(current.entry.revision) >= Number(entry.revision),
                          "provider-reader-cold-revision",
                      );
                      expectedRevision = current.entry.revision;
                  },
              }
            : {}),
        async send() {
            return (await context.call(capability, binding, input, assert)).observation;
        },
        async verify() {
            await context.refused(capability, { installationId: `missing-${crypto.randomUUID()}` }, [403, 404, 422]);
            assert(await context.checked(capability, input));
        },
    };
}
