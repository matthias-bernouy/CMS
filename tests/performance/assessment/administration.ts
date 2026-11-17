import { assessCapabilities } from "./run";
import { administrationScenarios } from "../scenarios/initialization/plan";

const version = Bun.argv[2] ?? "0.1.0-capability-assessment";
const result = await assessCapabilities(
    { edge: `cyaxis/ulvia-edge:${version}`, provider: `cyaxis/ulvia-provider:${version}` },
    Bun.argv[3],
    administrationScenarios,
    { contractId: "ulvia/cms.installations", capabilityId: "initialization.plan" },
);
process.exitCode = result.report.status === "passed" ? 0 : 1;
