import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Edge } from "../../interfaces/entities/Edge";
import type { AccessMetricsRepository, MetricDelta } from "../../interfaces/repositories/AccessMetricsRepository";
import { parseJsonLineToDelta } from "./parseAccessLine";

type AggKey = `${string}|${string}|${string}`;  // edgeId|bucketId|day

/**
 * For each edge, walk `<localDir>/<edgeId>/*.gz`, skipping files already
 * recorded in `repo.isFileProcessed`. Each new file is streamed through
 * zcat → buffered to lines → parsed JSON → folded into per-key counters.
 * After the file finishes cleanly, counters are flushed to the repo and
 * the file is marked as processed (so re-running the loop is idempotent).
 *
 * Failure mode: if the parser hits a malformed line we skip it and
 * continue. If the spawn fails we log + skip the file (it'll be retried
 * next tick). The processed-file marker is only written on success, so
 * a crash mid-file doesn't drop counts permanently.
 */
export async function aggregateAccessLogs(
    edges: ReadonlyArray<Edge>,
    localDir: string,
    repo: AccessMetricsRepository,
): Promise<void> {
    for (const edge of edges) {
        const dir = join(localDir, edge.id);
        let entries: string[] = [];
        try {
            entries = await readdir(dir);
        } catch { continue; }
        const archives = entries.filter((n) => n.endsWith(".gz")).sort();

        for (const filename of archives) {
            if (await repo.isFileProcessed(edge.id, filename)) continue;
            await processFile(edge.id, dir, filename, repo);
        }
    }
}

async function processFile(
    edgeId:   string,
    dir:      string,
    filename: string,
    repo:     AccessMetricsRepository,
): Promise<void> {
    const path = join(dir, filename);
    const proc = Bun.spawn({ cmd: ["zcat", path], stdout: "pipe", stderr: "pipe" });

    const aggregates = new Map<AggKey, MetricDelta>();
    let lineCount = 0;
    let bytesProcessed = 0;

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const delta = parseJsonLineToDelta(line, edgeId);
            if (!delta) continue;
            const key: AggKey = `${edgeId}|${delta.bucketId}|${delta.day}`;
            const acc = aggregates.get(key);
            if (acc) addDelta(acc, delta.metric);
            else     aggregates.set(key, { ...delta.metric });
            lineCount++;
            bytesProcessed += delta.metric.bytes;
        }
    }
    if (buf.trim()) {
        const delta = parseJsonLineToDelta(buf, edgeId);
        if (delta) {
            const key: AggKey = `${edgeId}|${delta.bucketId}|${delta.day}`;
            const acc = aggregates.get(key);
            if (acc) addDelta(acc, delta.metric); else aggregates.set(key, { ...delta.metric });
            lineCount++; bytesProcessed += delta.metric.bytes;
        }
    }
    if ((await proc.exited) !== 0) {
        console.warn(`[origin/log-agg] zcat ${path} exited non-zero, skipping`);
        return;
    }

    for (const [key, metric] of aggregates) {
        const [edge, bucket, day] = key.split("|");
        await repo.incrementMetric({ edgeId: edge!, bucketId: bucket!, day: day! }, metric);
    }
    await repo.markFileProcessed({
        id:             `${edgeId}:${filename}`,
        edgeId, filename,
        processedAt:    Date.now(),
        lineCount, bytesProcessed,
    });
}

function addDelta(acc: MetricDelta, d: MetricDelta): void {
    acc.requests  += d.requests;
    acc.bytes     += d.bytes;
    acc.status2xx += d.status2xx;
    acc.status3xx += d.status3xx;
    acc.status4xx += d.status4xx;
    acc.status5xx += d.status5xx;
}
