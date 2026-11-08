import type { BinaryInput } from "@bernouy/binary-media";
import type { TSystem } from "@bernouy/content";
import type { ResourceInitializationExecution } from "@bernouy/resources/initialization";
import type { VerifiedResourceArchive } from "@bernouy/resources";

export type ResourcePreparationTask =
    | { kind: "resource-archive"; bytes: BinaryInput; digest: string }
    | {
          kind: "resource-preview";
          bytes: BinaryInput | null;
          digest: string | null;
          execution: ResourceInitializationExecution;
          system: TSystem;
      };
export type ResourceArchiveWire = Omit<VerifiedResourceArchive, "bytes" | "assets"> & {
    assets: readonly { definition: VerifiedResourceArchive["assets"][number]["definition"]; bytes: Uint8Array }[];
};
