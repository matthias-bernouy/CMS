import { docker } from "../../../integration/instance/docker";

/** Cgroup counters contain no credentials and distinguish a peak from a running process's final RSS. */
export function parseMemoryEvidence(text: string) {
    if (Buffer.byteLength(text) > 4096) {
        throw Error("Memory evidence exceeds its byte bound");
    }
    const [current, peak, limit, ...lines] = text.trim().split("\n");
    const integer = (value: string | undefined) => {
        if (!value || !/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value))) {
            throw Error("Invalid memory counter");
        }
        return Number(value);
    };
    const events = new Map<string, number>();
    for (const line of lines) {
        const pair = /^([a-z_]+)\s+([0-9]+)$/u.exec(line);
        if (!pair || events.has(pair[1]!)) {
            throw Error("Invalid memory events");
        }
        events.set(pair[1]!, integer(pair[2]));
    }
    const result = {
        currentBytes: integer(current),
        peakBytes: integer(peak),
        limitBytes: limit === "max" ? null : integer(limit),
        oom: events.get("oom"),
        oomKills: events.get("oom_kill"),
    };
    if (
        result.peakBytes < result.currentBytes ||
        result.limitBytes === 0 ||
        result.oom === undefined ||
        result.oomKills === undefined
    ) {
        throw Error("Incomplete memory evidence");
    }
    return result;
}

/** One small read-only cat process is used only after Docker already reported an OOM event. */
export async function memoryEvidence(name: string, run = docker) {
    if (!/^ulvia-mcp-[a-f0-9]{8}-(?:provider|edge|mongo)$/u.test(name)) {
        throw Error("Memory evidence requires an owned performance container scope");
    }
    try {
        const result = await run([
            "exec",
            name,
            "cat",
            "/sys/fs/cgroup/memory.current",
            "/sys/fs/cgroup/memory.peak",
            "/sys/fs/cgroup/memory.max",
            "/sys/fs/cgroup/memory.events",
        ]);
        const counters = parseMemoryEvidence(result.stdout);
        return `memoryCurrentBytes=${counters.currentBytes}; memoryPeakBytes=${counters.peakBytes}; memoryLimitBytes=${counters.limitBytes ?? "unlimited"}; cgroupOom=${counters.oom}; cgroupOomKills=${counters.oomKills}`;
    } catch {
        return "memory evidence unavailable";
    }
}
