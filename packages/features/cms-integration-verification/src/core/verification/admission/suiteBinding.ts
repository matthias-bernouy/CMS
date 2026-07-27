import type {
    AdmissionInputSnapshotV1,
    BoundIntegrationVerificationAuthorSuiteV1,
    IntegrationVerificationAuthorSuiteType,
    IntegrationVerificationSuiteContentV2,
} from "../../../interfaces/verification";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { oneOf, sha256Digest, stableIdentifier } from "../../validation/values";
import { identifyIntegrationVerificationSuiteContent } from "./suiteContent";

export async function validateBoundIntegrationVerificationAuthorSuites(
    value: unknown,
    admission: AdmissionInputSnapshotV1,
): Promise<readonly BoundIntegrationVerificationAuthorSuiteV1[]> {
    const entries = await Promise.all(
        boundedArray(value, "authorSuites", (entry, field) => ({ entry, field })).map(async ({ entry, field }) => {
            const input = strictRecord(entry, field, ["suiteId", "source", "contentDigest", "content"]);
            const suiteId = stableIdentifier(input.suiteId, `${field}.suiteId`);
            const source = oneOf(input.source, `${field}.source`, ["author-contract", "author-conformance"] as const);
            const contentDigest = sha256Digest(input.contentDigest, `${field}.contentDigest`);
            const identified = await identifyIntegrationVerificationSuiteContent(input.content);
            const expectedType: IntegrationVerificationAuthorSuiteType =
                source === "author-contract" ? "contract" : "conformance";
            if (
                identified.digest !== contentDigest ||
                identified.content.type !== expectedType ||
                suiteIdentity(identified.content) !== suiteId
            ) {
                throw invalid(field, "does not bind its declared suite identity and canonical content digest");
            }
            return Object.freeze({ suiteId, source, contentDigest, content: identified.content });
        }),
    );
    assertUnique(
        entries.map((entry) => entry.suiteId),
        "authorSuites.suiteId",
    );
    const expected = admission.suites.filter((entry) => entry.source !== "platform");
    if (
        entries.length !== expected.length ||
        expected.some((suite) =>
            entries.every(
                (entry) =>
                    entry.suiteId !== suite.suiteId ||
                    entry.source !== suite.source ||
                    entry.contentDigest !== suite.contentDigest,
            ),
        )
    ) {
        throw invalid("authorSuites", "must contain every and only exact author suite in the admission plan");
    }
    return Object.freeze(entries.toSorted((left, right) => compareText(left.suiteId, right.suiteId)));
}

function suiteIdentity(content: IntegrationVerificationSuiteContentV2): string {
    return content.type === "contract"
        ? (content.suite as { contractId: string }).contractId
        : (content.suite as { suiteId: string }).suiteId;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
