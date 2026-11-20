import { expect } from "bun:test";
import type { mcpContainers } from "../../../integration/instance/containers";
import type { connectBrowser } from "../../../integration/instance/oauth";
import type { publicReader } from "../client/reader";
import type { Finding, Sample } from "./summary";
import type { CacheOptions, ScenarioId } from "../plan";

export type Context = {
    stack: Awaited<ReturnType<typeof mcpContainers>>;
    connection: Awaited<ReturnType<typeof connectBrowser>>;
    reader: ReturnType<typeof publicReader>;
    options: CacheOptions;
    flushWork: () => Promise<void>;
    findings: Finding[];
    epochs: unknown[];
    sample: (
        scenario: ScenarioId,
        phase: string,
        epoch: number,
        measured?: boolean,
        path?: string,
        headers?: Record<string, string>,
        replica?: { reader: ReturnType<typeof publicReader>; name: string },
    ) => Promise<Sample>;
};
export function requirePage(row: Sample, reader: ReturnType<typeof publicReader>, cache?: string) {
    expect(row.failure).toBeNull();
    expect(row.status).toBe(200);
    expect(reader.bodies[row.hash!] ?? "").toContain("Performance");
    if (cache) {
        expect(row.cache).toBe(cache);
    }
}
