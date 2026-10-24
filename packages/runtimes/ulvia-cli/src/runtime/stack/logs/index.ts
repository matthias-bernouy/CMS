import type { LogRecord } from "@bernouy/logging";
import { readLocalLogRecords, type LocalLogCursor } from "./journal";
import { formatRecord, matches, parseSelection } from "./selection";

export { readLocalLogRecords, type LocalLogCursor } from "./journal";

export async function showLocalLogs(
    args: readonly string[],
    paths: Readonly<{ logs: string }>,
    log: (message: string) => void,
    usage = "ulvia logs",
): Promise<void> {
    const selection = parseSelection(args, usage);
    const cursor: LocalLogCursor = new Map();
    let initial = true;
    do {
        const records = (await readLocalLogRecords(paths, selection.services, cursor)).filter((record) =>
            matches(record, selection),
        );
        records.sort(compareRecords);
        for (const record of records.slice(initial ? -200 : 0)) {
            log(formatRecord(record, selection));
        }
        initial = false;
        if (!selection.follow) {
            return;
        }
        await Bun.sleep(250);
    } while (true);
}

function compareRecords(left: LogRecord, right: LogRecord): number {
    return left.time.localeCompare(right.time);
}
