import type { Collection } from "mongodb";
import type { ProviderOperationRecord, ProviderOperationSummary } from "@bernouy/ulvia-provider";

type OperationDocument = Omit<ProviderOperationRecord, "id"> & { _id: string };

/** One indexed bounded metadata read; no request context, inputs, lease or result bodies. */
export async function latestOperation(
    records: Collection<OperationDocument>,
    siteId: string,
    contractId: string,
    capabilityId: string,
): Promise<ProviderOperationSummary | null> {
    const document = await records.findOne(
        { siteId, contractId, capabilityId },
        {
            sort: { _id: -1 },
            projection: {
                _id: 1,
                siteId: 1,
                contractId: 1,
                capabilityId: 1,
                status: 1,
                revision: 1,
                createdAt: 1,
                updatedAt: 1,
                errorCode: 1,
                errorOutput: 1,
                errorContentLanguage: 1,
            },
        },
    );
    if (!document) {
        return null;
    }
    if (
        document.siteId !== siteId ||
        document.contractId !== contractId ||
        document.capabilityId !== capabilityId ||
        !["queued", "running", "succeeded", "failed"].includes(document.status) ||
        !Number.isSafeInteger(document.revision) ||
        document.revision < 1
    ) {
        throw new Error("Invalid persisted operation summary");
    }
    return {
        id: document._id,
        siteId: document.siteId,
        contractId: document.contractId,
        capabilityId: document.capabilityId,
        status: document.status,
        revision: document.revision,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        ...(document.errorCode === undefined ? {} : { errorCode: document.errorCode }),
        ...(document.errorOutput === undefined ? {} : { errorOutput: document.errorOutput }),
        ...(document.errorContentLanguage === undefined ? {} : { errorContentLanguage: document.errorContentLanguage }),
    };
}
