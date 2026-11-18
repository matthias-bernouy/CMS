import { assertCondition, requireRecord } from "../queries/types";
import type { HostingContext } from "./context";

export function seekBefore(value: string) {
    assertCondition(value.length > 1 && /[a-z0-9]$/u.test(value));
    return value.slice(0, -1);
}

export function hostingPage(output: unknown, limit: number, field: "id" | "hostname") {
    const page = requireRecord(output);
    assertCondition(Array.isArray(page.items) && page.items.length <= limit);
    const items = page.items.map(requireRecord);
    const keys = items.map((item) => {
        assertCondition(typeof item[field] === "string");
        return String(item[field]);
    });
    assertCondition(
        new Set(keys).size === keys.length && keys.every((key, index) => index === 0 || key > keys[index - 1]!),
    );
    assertCondition(page.nextCursor === null || (keys.length > 0 && page.nextCursor === keys.at(-1)));
    return { items, keys, nextCursor: page.nextCursor };
}

export async function verifyNextPage(
    context: HostingContext,
    capability: string,
    input: Readonly<Record<string, unknown>>,
    output: unknown,
    field: "id" | "hostname",
) {
    const page = hostingPage(output, Number(input.limit), field);
    if (!page.keys.length) {
        return;
    }
    const next = hostingPage(
        await context.checked(capability, { ...input, after: page.keys.at(-1), limit: 1 }),
        1,
        field,
    );
    assertCondition(next.keys.every((key) => key > page.keys.at(-1)!));
    assertCondition(page.nextCursor === null ? next.keys.length === 0 : next.keys.length === 1);
}

export async function peekHosting(
    context: HostingContext,
    kind: "domains" | "zones",
    hostname: string,
    instanceId?: unknown,
) {
    const page = hostingPage(
        await context.checked(`${kind}.list`, {
            ...(kind === "domains" ? { instanceId } : {}),
            after: seekBefore(hostname),
            limit: 1,
        }),
        1,
        "hostname",
    );
    assertCondition(page.items[0]?.hostname === hostname);
    return page.items[0]!;
}
