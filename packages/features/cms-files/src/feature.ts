import { defineFeature } from "@bernouy/ulvia-sdk";
import { createNamespace } from "cms-files/capabilities/namespaces/create";
import { getNamespace } from "cms-files/capabilities/namespaces/get";
import { deleteNamespace } from "cms-files/capabilities/namespaces/delete";
import { createNamespaceKey } from "cms-files/capabilities/namespaces/keys/create";
import { rotateNamespaceKey } from "cms-files/capabilities/namespaces/keys/rotate";
import { revokeNamespaceKey } from "cms-files/capabilities/namespaces/keys/revoke";
import { createUpload } from "cms-files/capabilities/uploads/create";
import { writeUpload } from "cms-files/capabilities/uploads/write";
import { completeUpload } from "cms-files/capabilities/uploads/complete";
import { signFile } from "cms-files/capabilities/files/access/sign";
import { listFiles } from "cms-files/capabilities/files/metadata/list";
import { getFile } from "cms-files/capabilities/files/metadata/get";
import { updateFile } from "cms-files/capabilities/files/metadata/update";
import { publishFile } from "cms-files/capabilities/files/visibility/publish";
import { makeFilePrivate } from "cms-files/capabilities/files/visibility/make-private";
import { deleteFile } from "cms-files/capabilities/files/delete";
import { readFile } from "cms-files/capabilities/files/access/read";
import { listRepresentations } from "cms-files/capabilities/representations/list";
import { readRepresentation } from "cms-files/capabilities/representations/read";
import { signRepresentations } from "cms-files/capabilities/representations/sign";
import { getWorkspace } from "cms-files/capabilities/workspace/get";
import { createWorkspaceUpload } from "cms-files/capabilities/workspace/upload/create";
import { completeWorkspaceUpload } from "cms-files/capabilities/workspace/upload/complete";
import { updateWorkspaceFile } from "cms-files/capabilities/workspace/files/update";
import { setWorkspaceFileVisibility } from "cms-files/capabilities/workspace/files/set-visibility";
import { signWorkspaceFile } from "cms-files/capabilities/workspace/files/sign";
import { deleteWorkspaceFile } from "cms-files/capabilities/workspace/files/delete";

export const filesFeature = defineFeature({
    contractId: "ulvia/cms.files",
    name: "CMS Files",
    description: "Provider-neutral namespaces, streamed uploads, immutable public files, and signed private access.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { "icon": "media", "categories": ["administration", "content"] },
    documents: new URL("../docs/", import.meta.url),
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

export type { FilesService, FilesServices } from "cms-files/interfaces/FilesServices";
export type { CmsFileWorkspace } from "cms-files/interfaces/CmsFileWorkspace";
