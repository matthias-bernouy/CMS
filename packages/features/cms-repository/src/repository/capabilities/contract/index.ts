import definition from "./definition.json";
import repositoryInfo from "./capabilities/queries/repository-info.json";
import namespaceGet from "./capabilities/queries/namespace-get.json";
import namespaceClaim from "./capabilities/commands/namespaces/namespace-claim.json";
import namespaceRotate from "./capabilities/commands/namespaces/namespace-rotate.json";
import namespaceRevoke from "./capabilities/commands/namespaces/namespace-revoke.json";
import catalogueList from "./capabilities/queries/catalogue-list.json";
import releaseDownload from "./capabilities/queries/release-download.json";
import publicationBegin from "./capabilities/commands/publications/publication-begin.json";
import publicationStatus from "./capabilities/queries/publication-status.json";
import publicationCommit from "./capabilities/commands/publications/publication-commit.json";
import publicationAbort from "./capabilities/commands/publications/publication-abort.json";
import publicationAsset from "./capabilities/commands/publications/publication-asset.json";
import publicationState from "./capabilities/queries/publication-state.json";
import publicationYank from "./capabilities/commands/publications/publication-yank.json";

// Static imports keep authoring fragments out of runtime filesystem discovery.
// Preserve declaration order so this source split retains the existing release digest.
export default {
    ...definition,
    capabilities: [
        repositoryInfo,
        namespaceGet,
        namespaceClaim,
        namespaceRotate,
        namespaceRevoke,
        catalogueList,
        releaseDownload,
        publicationBegin,
        publicationStatus,
        publicationCommit,
        publicationAbort,
        publicationAsset,
        publicationState,
        publicationYank,
    ],
};
