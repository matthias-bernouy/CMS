import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import { assertLogAggregate, assertLogQuery } from "./oracle";
import type { LogCall, LogReadDataset } from "./dataset";
import type { PreparedSample } from "../../harness/execution/samples";

export async function prepareLogRead(
    dataset: LogReadDataset,
    capability: string,
    binding: string,
    variant: string,
    foreign: LogCall,
    otherInstance: LogCall,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const entry = variant === "invalidation" ? dataset.make() : dataset.rows()[0]!.entry;
    const input =
        capability === "logs.get"
            ? { id: entry.id }
            : capability === "logs.aggregate"
              ? { ...dataset.filters, groupBy: variant === "large" ? "event" : "level" }
              : { ...dataset.filters, limit: 16 };
    if (variant === "invalidation") {
        const primed = await dataset.call(
            capability,
            binding,
            input,
            capability === "logs.get" ? undefined : (output) => dataset.assert(capability, input, output),
        );
        assertCondition(
            capability === "logs.get"
                ? !primed.observation.validated &&
                      (binding === "mcp"
                          ? primed.observation.failure === "mcp-declared-NOT_FOUND"
                          : primed.observation.status === 404)
                : primed.observation.validated,
            "log-read-prime-failed",
        );
        await dataset.append([entry]);
    }
    return {
        async send() {
            return (
                await dataset.call(capability, binding, input, (output) => dataset.assert(capability, input, output))
            ).observation;
        },
        async verify() {
            const detail = await dataset.call("logs.get", "http", { id: entry.id }, (output) =>
                dataset.assert("logs.get", { id: entry.id }, output),
            );
            assertCondition(detail.observation.validated, "log-read-independent-detail");
            const before = canonicalizeIJson(detail.output);
            const denied = await foreign(capability, "http", input);
            assertCondition(
                !denied.observation.validated && [401, 403].includes(denied.observation.status),
                "log-read-foreign-session",
            );
            const other = await otherInstance(capability, "http", input);
            if (capability === "logs.get") {
                assertCondition(
                    !other.observation.validated && other.observation.status === 404,
                    "log-read-cross-instance-id",
                );
            } else {
                assertCondition(other.observation.validated, "log-read-cross-instance-query");
                if (capability === "logs.aggregate") {
                    assertLogAggregate(other.output, []);
                } else {
                    assertLogQuery(other.output, [], "", dataset.window, 0);
                }
            }
            await invalid(input);
            const cursor = await dataset.walk(binding);
            if (cursor) {
                const changed = await dataset.call("logs.query", "http", {
                    ...dataset.filters,
                    eventPrefix: `${dataset.marker}.different`,
                    cursor,
                    limit: 16,
                });
                const cross = await otherInstance("logs.query", "http", { ...dataset.filters, cursor, limit: 16 });
                assertCondition(
                    !changed.observation.validated &&
                        changed.observation.status === 422 &&
                        !cross.observation.validated &&
                        cross.observation.status === 422,
                    "log-read-cursor-scope",
                );
            }
            await dataset.replay();
            const after = await dataset.call("logs.get", "http", { id: entry.id });
            assertCondition(
                after.observation.validated && canonicalizeIJson(after.output) === before,
                "log-read-refusal-or-replay-mutated-state",
            );
            const counts = await dataset.call(
                "logs.aggregate",
                "http",
                { ...dataset.filters, groupBy: "level" },
                (output) => assertLogAggregate(output, dataset.rows()),
            );
            assertCondition(
                counts.observation.validated && typeof requireRecord(counts.output).total === "number",
                "log-read-retained-counts",
            );
        },
    };
}
