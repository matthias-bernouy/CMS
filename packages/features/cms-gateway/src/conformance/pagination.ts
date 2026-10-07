import type { ConformanceInvocationOutcome } from "./interfaces";
import { ConformanceExecutionError } from "./interfaces";
import { assertConformanceOutcome } from "./assertions";
import { readConformancePointer } from "./templates";
import type { ExecuteConformanceCallInput } from "./executeCall";

export async function executePagination(
    input: ExecuteConformanceCallInput & { authoredInput: Readonly<Record<string, unknown>> },
): Promise<{ attempts: number; outcome: ConformanceInvocationOutcome }> {
    const policy = input.call.pagination!;
    const cursors = new Set<string>();
    const identities = new Set<string>();
    let cursor: string | null | undefined;
    let outcome!: ConformanceInvocationOutcome;
    for (let page = 0; page < policy.maxPages; page += 1) {
        const requestInput = { ...input.authoredInput };
        if (cursor !== undefined) {
            Object.assign(requestInput, { [policy.cursorInput]: cursor });
        }
        const result = await input.environment.invoke({
            release: input.release,
            capabilityId: input.call.capabilityId,
            actor: input.call.actor,
            input: requestInput,
            fixtures: input.fixtures,
        });
        if (result.kind === "accepted") {
            fail("PAGINATION_ACCEPTED", "Paginated query returned an operation");
        }
        outcome = result;
        assertConformanceOutcome(outcome, input.call.expect, input.capability, input.captures);
        if (outcome.kind !== "success") {
            fail("PAGINATION_ERROR", "Paginated query failed");
        }
        assertUniqueItems(outcome.output, policy.itemsPath, policy.uniqueBy, identities);
        const next = readConformancePointer(outcome.output, policy.cursorPath);
        if (!next.present || (next.value !== null && typeof next.value !== "string")) {
            fail("INVALID_CURSOR", "Paginated query returned an invalid cursor");
        }
        cursor = next.value as string | null;
        if (cursor === null) {
            return { attempts: page + 1, outcome };
        }
        if (cursors.has(cursor)) {
            fail("CURSOR_LOOP", "Paginated query repeated a cursor");
        }
        cursors.add(cursor);
    }
    fail("PAGINATION_LIMIT", "Paginated query did not terminate within maxPages");
}

function assertUniqueItems(
    output: unknown,
    itemsPath: string,
    uniqueBy: string | undefined,
    identities: Set<string>,
): void {
    if (uniqueBy === undefined) {
        return;
    }
    const items = readConformancePointer(output, itemsPath);
    if (!items.present || !Array.isArray(items.value)) {
        fail("INVALID_ITEMS", "Pagination items are unavailable");
    }
    for (const item of items.value) {
        const selected = readConformancePointer(item, uniqueBy);
        const identity = `${typeof selected.value}:${String(selected.value)}`;
        if (!selected.present || identities.has(identity)) {
            fail("DUPLICATE_ITEM", "Pagination returned a duplicate identity");
        }
        identities.add(identity);
    }
}

function fail(code: string, message: string): never {
    throw new ConformanceExecutionError(code, message);
}
