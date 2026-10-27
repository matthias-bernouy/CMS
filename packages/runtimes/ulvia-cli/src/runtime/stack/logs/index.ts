import { LOG_LEVELS, type LogRecord } from "@bernouy/logging";
import type { LogDetail, LogQuery, LogSummary } from "@bernouy/cms-observability";
import { formatRecord, parseSelection } from "./selection";

export interface InstanceJournalClient {
    query(input: LogQuery): Promise<{ items: readonly LogSummary[]; nextCursor?: string | null }>;
    get(id: string): Promise<LogDetail>;
}

export async function showInstanceLogs(
    args: readonly string[],
    client: InstanceJournalClient,
    log: (message: string) => void,
): Promise<void> {
    const selection = parseSelection(args, "ulvia instance logs <name>");
    if (selection.services.length === 1 && selection.services[0] === "repository") {
        throw new Error("Repository diagnostics belong to the operator. Use ulvia services logs repository.");
    }
    const service =
        selection.services.length === 1
            ? { kernel: "cms-kernel", provider: "ulvia-provider", repository: "official-repository" }[
                  selection.services[0]!
              ]
            : undefined;
    const seen = new Set<string>();
    const input: LogQuery = {
        levels: LOG_LEVELS.slice(LOG_LEVELS.indexOf(selection.level)),
        ...(service ? { service } : {}),
        ...(selection.requestId ? { requestId: selection.requestId } : {}),
        ...(selection.event ? { event: selection.event } : {}),
        limit: 200,
        ...(selection.follow ? { timeField: "receivedAt" as const } : {}),
    };
    let initial = true;
    do {
        const items = await readJournalUpdates(client, input, seen, initial);
        for (const summary of items) {
            const entry = selection.stack ? await client.get(summary.id) : summary;
            log(formatRecord(toRecord(entry), selection));
            seen.add(summary.id);
        }
        initial = false;
        if (!selection.follow) {
            return;
        }
        if (seen.size > 2000) {
            const retained = [...seen].slice(-2000);
            seen.clear();
            for (const id of retained) {
                seen.add(id);
            }
        }
        await Bun.sleep(1000);
    } while (true);
}

/** Walk only new result pages, bounded to ten pages per poll; never silently skip a burst above one page. */
export async function readJournalUpdates(
    client: InstanceJournalClient,
    input: LogQuery,
    seen: ReadonlySet<string>,
    initial: boolean,
): Promise<LogSummary[]> {
    const pending = new Map<string, LogSummary>();
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        const page = await client.query({ ...input, ...(cursor ? { cursor } : {}) });
        for (const item of page.items) {
            if (!seen.has(item.id)) {
                pending.set(item.id, item);
            }
        }
        if (initial || page.items.some(({ id }) => seen.has(id)) || !page.nextCursor) {
            return [...pending.values()].reverse();
        }
        cursor = page.nextCursor;
    }
    throw new Error("More than 2000 new logs arrived between polls. Narrow the filters and query again.");
}

function toRecord(entry: LogSummary | LogDetail): LogRecord {
    return {
        time: entry.time,
        level: entry.level,
        service: entry.service,
        event: entry.event,
        attributes: {
            ...("attributes" in entry ? entry.attributes : {}),
            instanceId: entry.instanceId,
            ...(entry.requestId ? { requestId: entry.requestId } : {}),
        },
        ...("error" in entry && entry.error ? { error: entry.error } : {}),
    };
}
