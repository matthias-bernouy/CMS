import type { AdmissionReviewedBaselineReferenceV1 } from "@bernouy/cms-integration-verification";
import type {
    AppendReviewedSchemaBaselineRequest,
    ReviewedSchemaBaselineHistory,
    ReviewedSchemaBaselineLogicalKey,
    ReviewedSchemaBaselineStore,
} from "cms-integration-registry/interfaces/reportStore";
import { FsIntegrationRegistryCandidateAdmissionPlanningError } from "./types";

export class CapturedReviewedSchemaBaselineStore implements ReviewedSchemaBaselineStore {
    readonly #captured = new Map<string, ReviewedSchemaBaselineHistory>();

    constructor(private readonly delegate: ReviewedSchemaBaselineStore) {}

    async get(logicalKey: ReviewedSchemaBaselineLogicalKey) {
        const history = await this.delegate.get(logicalKey);
        if (history) {
            this.#capture(history);
        }
        return history;
    }

    async listAll() {
        const histories = await this.delegate.listAll();
        histories.forEach((history) => this.#capture(history));
        return histories;
    }

    async listForPackage(kind: string, version: string, packageDigest: string) {
        const histories = await this.delegate.listForPackage(kind, version, packageDigest);
        histories.forEach((history) => this.#capture(history));
        return histories;
    }

    append(_request: AppendReviewedSchemaBaselineRequest): Promise<ReviewedSchemaBaselineHistory> {
        throw new TypeError("A captured reviewed baseline view is read-only");
    }

    references(): readonly AdmissionReviewedBaselineReferenceV1[] {
        return Object.freeze(
            [...this.#captured.values()]
                .map(baselineReference)
                .toSorted((left, right) => compareText(referenceKey(left), referenceKey(right))),
        );
    }

    histories(): readonly ReviewedSchemaBaselineHistory[] {
        return Object.freeze([...this.#captured.values()]);
    }

    async assertStillCurrent(): Promise<void> {
        for (const history of this.#captured.values()) {
            const current = await this.delegate.get(history.logicalKey);
            if (
                !current ||
                current.currentRevisionId !== history.currentRevisionId ||
                current.currentBaselineDigest !== history.currentBaselineDigest
            ) {
                throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                    "catalog_changed",
                    `Reviewed schema baseline ${history.current.reportId} changed during candidate planning`,
                );
            }
        }
    }

    #capture(history: ReviewedSchemaBaselineHistory): void {
        const key = logicalKey(history.logicalKey);
        const existing = this.#captured.get(key);
        if (
            existing &&
            (existing.currentRevisionId !== history.currentRevisionId ||
                existing.currentBaselineDigest !== history.currentBaselineDigest)
        ) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "catalog_changed",
                `Reviewed schema baseline ${history.current.reportId} changed during candidate planning`,
            );
        }
        this.#captured.set(key, history);
    }
}

function baselineReference(history: ReviewedSchemaBaselineHistory): AdmissionReviewedBaselineReferenceV1 {
    const baseline = history.current;
    return {
        kind: baseline.kind,
        version: baseline.version,
        packageDigest: baseline.packageDigest,
        connectorKey: baseline.connectorKey,
        lineageId: baseline.lineageId,
        revisionId: history.currentRevisionId,
        baselineDigest: history.currentBaselineDigest,
        observedSchemaDigest: baseline.observedSchemaDigest,
    };
}

function logicalKey(key: ReviewedSchemaBaselineLogicalKey): string {
    return `${key.kind}\0${key.version}\0${key.packageDigest}\0${key.connectorKey}\0${key.lineageId}`;
}

function referenceKey(reference: AdmissionReviewedBaselineReferenceV1): string {
    return `${reference.kind}\0${reference.version}\0${reference.packageDigest}\0${reference.connectorKey}\0${reference.lineageId}`;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
