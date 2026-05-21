import { open, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { LogStore, LogQuery, LogPage } from "src/interfaces/LogStore";
import type { LogRecord } from "src/types/LogRecord";
import { filterRecords, paginate } from "src/core/log/paginate";

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const dayOf = (ts: string): string => ts.slice(0, 10);          // ISO → YYYY-MM-DD
const minusDays = (day: string, n: number): string =>
    new Date(new Date(`${day}T00:00:00.000Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Persistent default `LogStore`: **daily-rotated** append-only JSONL under a
 * directory (`<dir>/YYYY-MM-DD.jsonl`), with **retention** (default 30 days).
 * This is the SANE low-volume default — bounded by construction (old day-
 * files are pruned), and a time-windowed `query` (`sinceTs`/`untilTs`) reads
 * ONLY the relevant day-files, so cost tracks the window, not total history.
 * High-volume / multi-instance deployments inject a DB-backed `LogStore`
 * (base.md §10.4 — the QUERY contract is standardized, the backend is not).
 *
 * Durability: `append` does open → write → fsync → close so an audit record
 * is on disk before it resolves (§10.4). Writes are serialized in-process so
 * a rotation/prune can't race a concurrent append. The day is taken from the
 * record's own `ts` (deterministic; no separate clock).
 */
export class FileLogStore implements LogStore {
    private chain: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly dir: string,
        private readonly opts: { retentionDays?: number } = {},
    ) {}

    private get retentionDays(): number { return this.opts.retentionDays ?? 30; }
    private file(day: string): string { return join(this.dir, `${day}.jsonl`); }

    /** Serialize mutations + reads so a prune never races an append. */
    private locked<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.chain.then(fn, fn);
        this.chain = run.then(() => undefined, () => undefined);
        return run;
    }

    append(record: LogRecord): Promise<void> {
        return this.locked(async () => {
            await mkdir(this.dir, { recursive: true });
            const day = dayOf(record.ts);
            const fh = await open(this.file(day), "a");
            try {
                await fh.write(JSON.stringify(record) + "\n", null, "utf8");
                await fh.sync();
            } finally {
                await fh.close();
            }
            await this.prune(day);
        });
    }

    /** Drop day-files older than the retention window relative to `today`. */
    private async prune(today: string): Promise<void> {
        const cutoff = minusDays(today, this.retentionDays);
        const files = await readdir(this.dir).catch(() => [] as string[]);
        await Promise.all(files.map(async (f) => {
            const m = DAY_FILE.exec(f);
            if (m && m[1]! < cutoff) await unlink(join(this.dir, f)).catch(() => {});
        }));
    }

    query(q: LogQuery): Promise<LogPage> {
        return this.locked(async () => {
            const since = q.sinceTs ? dayOf(q.sinceTs) : undefined;
            const until = q.untilTs ? dayOf(q.untilTs) : undefined;
            const days = (await readdir(this.dir).catch(() => [] as string[]))
                .map((f) => DAY_FILE.exec(f)?.[1])
                .filter((d): d is string => d !== undefined)
                .filter((d) => (since === undefined || d >= since) && (until === undefined || d <= until))
                .sort();
            const all: LogRecord[] = [];
            for (const d of days) {
                const text = await Bun.file(this.file(d)).text().catch(() => "");
                for (const line of text.split("\n")) if (line) all.push(JSON.parse(line) as LogRecord);
            }
            return paginate(filterRecords(all, q), q);
        });
    }
}
