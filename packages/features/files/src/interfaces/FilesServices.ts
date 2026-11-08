import type { CmsFilesService } from "files/core/service";
import type { CmsFileWorkspace } from "files/interfaces/CmsFileWorkspace";

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
