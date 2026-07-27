import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { invalid } from "./fields";

export function assertCandidateAdmissionState(record: IntegrationRegistryCandidateRecord): void {
    if (Boolean(record.policyDigest) !== Boolean(record.admissionInputDigest)) {
        invalid("Candidate policy and admission input digests must be present together");
    }
    if (Boolean(record.compatibilityReportDigest) !== Boolean(record.statefulChangeSelectionDigest)) {
        invalid("Candidate compatibility report and stateful-change selection digests must be present together");
    }
    if ((record.compatibilityReportDigest || record.statefulChangeSelectionDigest) && !record.admissionInputDigest) {
        invalid("Candidate planning artifacts require exact admission inputs");
    }
    if (record.migrationInputDigests && !record.admissionInputDigest) {
        invalid("Candidate migration inputs require exact admission inputs");
    }
    if (["queued", "running", "passed", "publishing", "published"].includes(record.status)) {
        if (!record.policyDigest || !record.admissionInputDigest) {
            invalid(`Candidate ${record.status} status requires exact admission input digests`);
        }
    }
    if (["uploaded", "validating"].includes(record.status)) {
        if (
            record.policyDigest ||
            record.admissionInputDigest ||
            record.migrationInputDigests ||
            record.admissionJobResultDigest
        ) {
            invalid(`Candidate ${record.status} status cannot carry admission results`);
        }
    }
    if (["passed", "publishing", "published"].includes(record.status) && !record.admissionJobResultDigest) {
        invalid(`Candidate ${record.status} status requires an exact admission job result digest`);
    }
    if (record.admissionJobResultDigest && record.attemptCount < 1) {
        invalid("Candidate result digest requires at least one worker attempt");
    }
    if (
        record.status === "queued" &&
        record.admissionJobResultDigest &&
        record.lastFailure?.kind !== "infrastructure"
    ) {
        invalid("Candidate queued result must describe a retryable infrastructure failure");
    }
    if (
        record.status === "rejected" &&
        record.lastFailure?.kind !== "validation" &&
        (!record.policyDigest || !record.admissionInputDigest || !record.admissionJobResultDigest)
    ) {
        invalid("Candidate verification rejection requires exact admission and result digests");
    }
}
