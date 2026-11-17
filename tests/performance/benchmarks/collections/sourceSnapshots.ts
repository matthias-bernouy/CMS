import { parseSourceSnapshot } from "@bernouy/repository/repository/authoring";
import { assertGrowth, assertMaximum, benchmark, printResults } from "../benchmark";

export async function runSourceSnapshotBenchmarks() {
    const results = [];
    for (const count of [2048, 8192, 16_384]) {
        const sourceJson = JSON.stringify({
            files: [
                { path: "definition.json", content: "{}" },
                ...Array.from({ length: count - 1 }, (_, index) => ({
                    path: `texts/group-${Math.floor(index / 16)}/item-${index}.json`,
                    content: "{}",
                })),
            ],
        });
        const result = await benchmark(`source snapshot: ${count} files`, () => parseSourceSnapshot(sourceJson));
        results.push(result);
        assertMaximum(`${result.name} p95`, result.p95Ms, 1500);
    }
    printResults("Source snapshot parsing and prefix validation", results);
    assertGrowth("8,192 to 16,384 source files growth", results[1]!, results[2]!, 4);
}
