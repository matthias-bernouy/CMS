import type { IntegrationRegistryCandidateRecord } from "@bernouy/cms-integration-registry";
import { projectCandidateStatus } from "../../contracts";

export function projectManagementCandidateStatus(record: IntegrationRegistryCandidateRecord) {
    return Object.freeze({
        ...projectCandidateStatus(record),
        ...(record.submittedBy ? { submittedBy: record.submittedBy } : {}),
    });
}
