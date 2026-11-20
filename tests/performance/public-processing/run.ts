import { beginSupplementary, writeSupplementary } from "../reporting/storage/supplementary";
import { contentMeasurements } from "./content";
import { routingMeasurements } from "./routing";

if (Bun.argv.length !== 2) {
    throw new Error("This fixed workload command accepts no arguments");
}
const start = await beginSupplementary("benchmarks", {
    benchmark: "public-processing-v1",
    samples: 100,
    warmups: 20,
    fixtures: { catalogue: 200, used: 20, staticTextNodes: 1500, renderedParagraphs: 500 },
    limitations:
        "Shared development host. Content operations use real LinkeDOM and renderer with deterministic injected read ports; routing uses real disposable Mongo. These component timings are not public endpoint TTFB. Fixture preparation and output verification excluded. No capability coverage credit.",
});
let status: "passed" | "failed" = "failed";
let results: unknown;
try {
    results = { content: await contentMeasurements(), routing: await routingMeasurements() };
    status = "passed";
} catch (error) {
    results = { error: String(error) };
    process.exitCode = 1;
}
console.log(await writeSupplementary(start, results, status));
