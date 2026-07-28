import type {
    AdmissionActiveContractReferenceV1,
    IntegrationVerificationEnvelopeV1,
    IntegrationVerificationSuiteContentV2,
} from "@bernouy/cms-integration-verification";
import type { IntegrationVerificationContractCatalog } from "../planning";
import type { IntegrationRegistryCatalogSnapshotProvider } from "cms-integration-registry/interfaces/catalog";
import type { IntegrationRegistryMutationCoordinator } from "cms-integration-registry/interfaces/mutations";
import type { IntegrationVerificationBundleStore } from "cms-integration-registry/interfaces/reportStore";

export type FsIntegrationVerificationContractCatalogConfig = Readonly<{
    root: string;
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    mutations: IntegrationRegistryMutationCoordinator;
    bundles: IntegrationVerificationBundleStore;
}>;

export type IntegrationVerificationContractLineageKey = Readonly<{
    kind: string;
    contractId: string;
}>;

export type IntegrationVerificationContractLineageRevision = Readonly<{
    revisionId: string;
    lineageId: string;
    kind: string;
    contractId: string;
    ownerVersion: string;
    ownerPackageDigest: string;
    ownerVerificationDigest: string;
    activeMajorRange: string;
    entrypoint: string;
    contractDigest: string;
    createdAt: string;
    provenance: Readonly<{
        candidateId: string;
        decisionRevisionId: string;
        decisionDigest: string;
    }>;
}>;

export type RegisterIntegrationVerificationContractsRequest = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    verification: IntegrationVerificationEnvelopeV1;
    activeContracts: readonly AdmissionActiveContractReferenceV1[];
    createdAt: string;
    provenance: IntegrationVerificationContractLineageRevision["provenance"];
}>;

export interface IntegrationVerificationContractLineageStore extends IntegrationVerificationContractCatalog {
    register(
        request: RegisterIntegrationVerificationContractsRequest,
    ): Promise<readonly IntegrationVerificationContractLineageRevision[]>;
}

export type PersistedInheritedVerificationContract = Readonly<{
    revision: IntegrationVerificationContractLineageRevision;
    content: IntegrationVerificationSuiteContentV2;
}>;
