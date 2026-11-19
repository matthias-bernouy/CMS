import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";
import type { settingsTenants } from "./tenant";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { QueryEnvironment } from "../../queries/execute";

type Lease = Awaited<ReturnType<ReturnType<typeof settingsTenants>>>;
type FaviconLease = Readonly<{ value: Pick<Lease["value"], "prepare" | "fixture" | "client">; release: () => void }>;

export async function prepareFavicon(
    lease: FaviconLease,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
    variant: string,
): Promise<PreparedSample> {
    const state = lease.value;
    try {
        await state.prepare(binding);
        const read = () => state.fixture("site.favicon.get", {});
        const original = await read();
        let before = original;
        const marker = `/performance-favicon-${randomUUID()}.svg`;
        if (variant === "invalidation") {
            const prime = await state.client("ulvia/cms.content", capability, binding, {});
            assertCondition(prime.observation.validated, "favicon-prime-failed");
            await state.fixture("site.favicon.update", { expectedRevision: before.revision, favicon: marker });
            before = await read();
            assertCondition(
                before.favicon === marker && before.revision === Number(original.revision) + 1,
                "favicon-invalidation-missing",
            );
        }
        const command = capability === "site.favicon.update";
        let input: Readonly<Record<string, unknown>> = command
            ? { expectedRevision: before.revision, favicon: marker }
            : {};
        let expected: Readonly<Record<string, unknown>> = command
            ? { revision: Number(before.revision) + 1, favicon: marker }
            : before;
        return {
            ...(variant === "cold"
                ? {
                      async beforeMeasure() {
                          // The lifecycle wrapper restarts first; refresh only the optimistic revision.
                          const current = await state.fixture("site.get", {});
                          assertCondition(
                              typeof current.revision === "number" &&
                                  Number.isSafeInteger(current.revision) &&
                                  current.revision >= Number(before.revision),
                              "favicon-cold-revision-invalid",
                          );
                          if (command) {
                              input = { ...input, expectedRevision: current.revision };
                          }
                          expected = {
                              revision: current.revision + (command ? 1 : 0),
                              favicon: command ? marker : before.favicon,
                          };
                      },
                  }
                : {}),
            async send() {
                return (
                    await state.client("ulvia/cms.content", capability, binding, input, (value) => {
                        const out = requireRecord(value);
                        assertCondition(
                            out.favicon === expected.favicon && out.revision === expected.revision,
                            "favicon-output-mismatch",
                        );
                    })
                ).observation;
            },
            async verify() {
                assertCondition(
                    canonicalizeIJson(await read()) === canonicalizeIJson(expected),
                    "favicon-not-persisted",
                );
                const foreign = await state.client("ulvia/cms.content", capability, "http", input, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                });
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "favicon-foreign-session",
                );
                const invalid = await state.client("ulvia/cms.content", "site.favicon.update", "http", {
                    expectedRevision: expected.revision,
                    favicon: "javascript:performance-refusal",
                });
                assertCondition(
                    !invalid.observation.validated && invalid.observation.status === 422,
                    "favicon-unsafe-reference-accepted",
                );
                const stale = await state.client("ulvia/cms.content", "site.favicon.update", "http", {
                    expectedRevision: Number(expected.revision) + 1,
                    favicon: null,
                });
                assertCondition(
                    !stale.observation.validated && stale.observation.status === 409,
                    "favicon-stale-write-accepted",
                );
                assertCondition(
                    canonicalizeIJson(await read()) === canonicalizeIJson(expected),
                    "favicon-refusal-mutated-state",
                );
            },
            async close() {
                try {
                    const current = await read();
                    if (current.favicon !== original.favicon) {
                        await state.fixture("site.favicon.update", {
                            expectedRevision: current.revision,
                            favicon: original.favicon,
                        });
                    }
                } finally {
                    lease.release();
                }
            },
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}
