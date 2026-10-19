import type { LogRecord } from "@bernouy/logging";
import type { UlviaPaths } from "../../paths";
import { readDevLogRecords, type DevLogCursor } from "./journal";
import { formatRecord, matches, parseSelection } from "./selection";

export { readDevLogRecords, type DevLogCursor } from "./journal";

export async function showDevLogs(
    args: readonly string[],
    paths: UlviaPaths,
    log: (message: string) => void,
): Promise<void> {
    const selection = parseSelection(args);
    const cursor: DevLogCursor = new Map();
    let initial = true;
    do {
        const records = (await readDevLogRecords(paths, selection.services, cursor)).filter((record) =>
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
