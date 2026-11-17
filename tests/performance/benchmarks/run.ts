import { runSourceSnapshotBenchmarks } from "./collections/sourceSnapshots";
import { runBrowserBindingBenchmarks } from "./browser/browserBinding";
import { runBrowserWorkloadBenchmarks } from "./browser/browserWorkloads";
import { runCollectionBuildBenchmarks } from "./collections/collectionBuild";
import { runCollectionValidationBenchmarks } from "./collections/collectionValidation";
import { runCollectionUpgradeBenchmarks } from "./collections/collectionUpgrade";
import { runContentValidationBenchmarks } from "./content/contentValidation";
import { runContractValidationBenchmarks } from "./contracts/contractValidation";
import { runNetworkTransportBenchmarks } from "./contracts/networkTransport";
import { benchmarkEvidence } from "./benchmark";
import { beginSupplementary, writeSupplementary } from "../reporting/storage/supplementary";

console.log("Ulvia performance suite (results are machine-dependent; growth and generous ceilings are gated)");
const start = await beginSupplementary("benchmarks");
const stages: Array<{ name: string; status: "passed" | "failed" }> = [];
for (const [name, run] of [
    ["collection-validation", runCollectionValidationBenchmarks],
    ["collection-build", runCollectionBuildBenchmarks],
    ["source-snapshots", runSourceSnapshotBenchmarks],
    ["collection-upgrade", runCollectionUpgradeBenchmarks],
    ["contract-validation", runContractValidationBenchmarks],
    ["network-transport", runNetworkTransportBenchmarks],
    ["content-validation", runContentValidationBenchmarks],
    ["browser-binding", runBrowserBindingBenchmarks],
    ["browser-workloads", runBrowserWorkloadBenchmarks],
] as const) {
    try {
        await run();
        stages.push({ name, status: "passed" });
    } catch {
        stages.push({ name, status: "failed" });
        console.error(`Performance group failed: ${name}; remaining groups will still run`);
    }
}
const status = stages.some((stage) => stage.status === "failed") ? "failed" : "passed";
const path = await writeSupplementary(start, { ...benchmarkEvidence(), stages }, status);
console.log(`Supplementary performance report: ${path}`);
if (status === "failed") {
    process.exitCode = 1;
} else {
    console.log("\nPerformance budgets passed.");
}
