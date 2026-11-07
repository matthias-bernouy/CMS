import type { CmsFilesService } from "cms-files/core/service";
import type { CmsFileWorkspace } from "cms-files/interfaces/CmsFileWorkspace";

/** Structural port: alternative implementations do not depend on the facade's private stores. */
export type FilesService = Pick<
    CmsFilesService,
    | "createNamespace"
    | "getNamespace"
    | "createNamespaceKey"
    | "rotateNamespaceKey"
    | "revokeNamespaceKey"
    | "deleteNamespace"
    | "createUpload"
    | "writeUpload"
    | "completeUpload"
    | "signFile"
    | "listFiles"
    | "getFile"
    | "updateFile"
    | "setFileVisibility"
    | "listRepresentations"
    | "readFile"
    | "readRepresentation"
    | "signRepresentations"
    | "deleteFile"
>;
export interface FilesServices {
    readonly files: FilesService;
    readonly workspace: CmsFileWorkspace;
}
