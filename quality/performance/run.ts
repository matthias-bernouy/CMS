import { runBrowserBindingBenchmarks } from "./browser/browserBinding";
import { runBrowserWorkloadBenchmarks } from "./browser/browserWorkloads";
import { runCollectionBuildBenchmarks } from "./collections/collectionBuild";
import { runCollectionValidationBenchmarks } from "./collections/collectionValidation";
import { runCollectionMigrationBenchmarks } from "./collections/collectionMigration";
import { runContentValidationBenchmarks } from "./content/contentValidation";
import { runContractValidationBenchmarks } from "./contracts/contractValidation";
import { runNetworkTransportBenchmarks } from "./contracts/networkTransport";

console.log("Ulvia performance suite (results are machine-dependent; growth and generous ceilings are gated)");
await runCollectionValidationBenchmarks();
await runCollectionBuildBenchmarks();
await runCollectionMigrationBenchmarks();
await runContractValidationBenchmarks();
await runNetworkTransportBenchmarks();
await runContentValidationBenchmarks();
await runBrowserBindingBenchmarks();
await runBrowserWorkloadBenchmarks();
console.log("\nPerformance budgets passed.");
