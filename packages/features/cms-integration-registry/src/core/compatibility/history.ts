import type {
    IntegrationCompatibilityAdmissionReport,
    IntegrationCompatibilityReport,
    IntegrationCompatibilityReportHistory,
    IntegrationCompatibilityReportRevision,
} from "../../interfaces/compatibility";
import { immutableClone } from "../catalog/immutability";

export class InMemoryIntegrationCompatibilityReportHistory implements IntegrationCompatibilityReportHistory {
    private readonly admissionReport: IntegrationCompatibilityAdmissionReport;
    private readonly reports: IntegrationCompatibilityReport[];
    private readonly ids: Set<string>;

    constructor(admission: IntegrationCompatibilityAdmissionReport) {
        if (admission.reportType !== "admission") {
            throw new TypeError("Compatibility report history must start with an admission report");
        }
        this.admissionReport = immutableClone(admission);
        this.reports = [this.admissionReport];
        this.ids = new Set([this.admissionReport.id]);
    }

    admission(): IntegrationCompatibilityAdmissionReport {
        return this.admissionReport;
    }

    current(): IntegrationCompatibilityReport {
        return this.reports[this.reports.length - 1]!;
    }

    list(): readonly IntegrationCompatibilityReport[] {
        return Object.freeze([...this.reports]);
    }

    append(revision: IntegrationCompatibilityReportRevision): void {
        const current = this.current();
        if (revision.reportType !== "revision") {
            throw new TypeError("Only compatibility report revisions may be appended");
        }
        if (revision.supersedes !== current.id) {
            throw new TypeError(`Compatibility revision must supersede current report "${current.id}"`);
        }
        if (this.ids.has(revision.id)) {
            throw new TypeError(`Compatibility report ID "${revision.id}" already exists`);
        }
        if (
            revision.kind !== this.admissionReport.kind ||
            revision.version !== this.admissionReport.version ||
            revision.packageDigest !== this.admissionReport.packageDigest
        ) {
            throw new TypeError("Compatibility revisions cannot change the admitted package identity");
        }
        const immutableRevision = immutableClone(revision);
        this.reports.push(immutableRevision);
        this.ids.add(immutableRevision.id);
    }
}
