import type {
    CollectionLimits,
    CollectionBundleAsset,
    CollectionRelease,
    CollectionValidationCode,
    CollectionPublicationCode,
    CollectionPublicationResource,
} from "@bernouy/repository/collections";

export type VerificationTask =
    | { kind: "json"; value: string | Uint8Array; digest: unknown; limits?: Readonly<CollectionLimits> }
    | { kind: "metadata"; value: unknown; digest: unknown; limits?: Readonly<CollectionLimits> }
    | {
          kind: "artifact";
          value: unknown;
          assets: readonly CollectionBundleAsset[];
          digest: unknown;
          limits?: Readonly<CollectionLimits>;
      }
    | { kind: "evolution"; previous: CollectionRelease; next: CollectionRelease };

export type VerificationRequest = { id: number; task: VerificationTask };
export type VerificationReply = {
    id: number;
    value?: unknown;
    error?: {
        message: string;
        code?: CollectionValidationCode;
        path?: string;
        publicationCode?: CollectionPublicationCode;
        publicationResource?: CollectionPublicationResource;
    };
};
