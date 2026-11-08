export { CmsFilesService, type CmsFilesServiceOptions } from "files/core/service";
export {
    CmsImageDerivatives,
    type CmsImageDerivativesOptions,
} from "files/default-implementation/CmsImageDerivatives";
export { CmsFilesError } from "files/core/credentials";
export type {
    CmsFileRead,
    CmsFilesStore,
    FileRecord,
    FileReference,
    FileVariant,
    FileDerivativeScheduler,
    NamespaceKeyRecord,
    NamespacePermission,
    NamespaceRecord,
    UploadRecord,
} from "files/interfaces";

export type { FilesService, FilesServices } from "files/interfaces/FilesServices";
export type { CmsFileWorkspace } from "files/interfaces/CmsFileWorkspace";
