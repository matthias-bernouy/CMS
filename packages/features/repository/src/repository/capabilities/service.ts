import type { RepositoryCapabilityPorts } from "./interfaces";
import { repositoryReads } from "./reads";
import { repositoryNamespaces } from "./namespaces";
import { repositorySources } from "./sources";
import { repositoryPublications } from "./uploads";

export { RepositoryRequestError as RepositoryCapabilityError } from "../core/errors";

/** Typed domain facade; authenticated account identity is supplied by the host. */
export class RepositoryCapabilityService {
    readonly reads;
    readonly namespaces;
    readonly sources;
    readonly publications;
    constructor(ports: RepositoryCapabilityPorts) {
        this.reads = repositoryReads(ports);
        this.namespaces = repositoryNamespaces(ports);
        this.sources = repositorySources(ports);
        this.publications = repositoryPublications(ports);
    }
}
