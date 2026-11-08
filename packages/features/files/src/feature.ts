import { mapFilesError } from "files/capabilities/mapError";
import { defineFeature } from "@bernouy/ulvia-sdk";
import { createNamespace } from "files/capabilities/namespaces/create";
import { getNamespace } from "files/capabilities/namespaces/get";
import { deleteNamespace } from "files/capabilities/namespaces/delete";
import { createNamespaceKey } from "files/capabilities/namespaces/keys/create";
import { rotateNamespaceKey } from "files/capabilities/namespaces/keys/rotate";
import { revokeNamespaceKey } from "files/capabilities/namespaces/keys/revoke";
import { createUpload } from "files/capabilities/uploads/create";
import { writeUpload } from "files/capabilities/uploads/write";
import { completeUpload } from "files/capabilities/uploads/complete";
import { signFile } from "files/capabilities/files/access/sign";
import { listFiles } from "files/capabilities/files/metadata/list";
import { getFile } from "files/capabilities/files/metadata/get";
import { updateFile } from "files/capabilities/files/metadata/update";
import { publishFile } from "files/capabilities/files/visibility/publish";
import { makeFilePrivate } from "files/capabilities/files/visibility/make-private";
import { deleteFile } from "files/capabilities/files/delete";
import { readFile } from "files/capabilities/files/access/read";
import { listRepresentations } from "files/capabilities/representations/list";
import { readRepresentation } from "files/capabilities/representations/read";
import { signRepresentations } from "files/capabilities/representations/sign";
import { getWorkspace } from "files/capabilities/workspace/get";
import { createWorkspaceUpload } from "files/capabilities/workspace/upload/create";
import { completeWorkspaceUpload } from "files/capabilities/workspace/upload/complete";
import { updateWorkspaceFile } from "files/capabilities/workspace/files/update";
import { setWorkspaceFileVisibility } from "files/capabilities/workspace/files/set-visibility";
import { signWorkspaceFile } from "files/capabilities/workspace/files/sign";
import { deleteWorkspaceFile } from "files/capabilities/workspace/files/delete";

export const filesFeature = defineFeature({
    contractId: "ulvia/cms.files",
    name: "CMS Files",
    description: "Provider-neutral namespaces, streamed uploads, immutable public files, and signed private access.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { "icon": "media", "categories": ["administration", "content"] },
    documents: new URL("../docs/", import.meta.url),
    mapError: mapFilesError,
    capabilities: [
        createNamespace,
        getNamespace,
        deleteNamespace,
        createNamespaceKey,
        rotateNamespaceKey,
        revokeNamespaceKey,
        createUpload,
        writeUpload,
        completeUpload,
        signFile,
        listFiles,
        getFile,
        updateFile,
        publishFile,
        makeFilePrivate,
        deleteFile,
        readFile,
        listRepresentations,
        readRepresentation,
        signRepresentations,
        getWorkspace,
        createWorkspaceUpload,
        completeWorkspaceUpload,
        updateWorkspaceFile,
        setWorkspaceFileVisibility,
        signWorkspaceFile,
        deleteWorkspaceFile,
    ],
});

export type { FilesService, FilesServices } from "files/interfaces/FilesServices";
export type { CmsFileWorkspace } from "files/interfaces/CmsFileWorkspace";
