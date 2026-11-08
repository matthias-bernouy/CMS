export { readResourceArchive } from "resources/archive/read";
export { writeResourceArchive } from "resources/archive/write";
export { ResourceArchiveError } from "resources/archive/errors";
export type {
    ResourceDocument,
    VerifiedResourceArchive,
    ResourceArchiveOptions,
    ResourceArchiveSource,
} from "resources/interfaces/archive";
export type { ResourceAsset, ResourcePage, ResourceTextSource } from "resources/archive/schemas";
