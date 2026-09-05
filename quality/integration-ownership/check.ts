import { resolve } from "node:path";
import { auditIntegrationOwnership, formatIntegrationOwnershipFindings } from "./audit";

const root = resolve(import.meta.dir, "../..");
const audit = await auditIntegrationOwnership(root);
const high = audit.findings.filter(({ confidence }) => confidence === "high");
const review = audit.findings.filter(({ confidence }) => confidence === "review");

console.log(
    `Integration ownership audit: ${audit.catalog.descriptors.length} integrations, ${high.length} high-confidence finding(s), ${review.length} finding(s) to review.`,
);
if (audit.findings.length > 0) {
    console.log(formatIntegrationOwnershipFindings(audit.findings));
}
if (high.length > 0) {
    process.exitCode = 1;
}
