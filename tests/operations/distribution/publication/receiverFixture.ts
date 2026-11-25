import { join } from "node:path";
import { ReleaseValidationError } from "@bernouy/ulvia-contracts";
import {
    LocalArtifactFiles,
    LocalContractReleases,
    FilesystemRepositoryPublicationRegistry,
} from "@bernouy/repository/repository/filesystem";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import type { PublicationEnvelope } from "@bernouy/repository/repository/publication";
import { repositoryApplication } from "../../../fixtures/repository/application";
import { prepareImagePublication } from "../../../../infra/images/registry";
import { prepareNpmPublication } from "../../../../infra/distribution/npm";
import { completeReceipt } from "../../../../infra/distribution/receipt";
import { publishDistribution } from "../../../../infra/distribution/publish";
import type { PublicationPorts } from "../../../../infra/distribution/publish";
import type { PublicationPhase } from "../../../../infra/distribution/options";
import { registryFixture } from "../images/fixture";
import { npmFixture } from "../npm/fixture";

/** Real Registry HTTP/admission, with a deliberately old receiver and fake external distribution registries. */
export async function receiverFixture() {
    const f = await npmFixture();
    const files = new LocalArtifactFiles(join(f.destination, "repository"));
    const contracts = new LocalContractReleases(files);
    const original = await contracts.getMetadata("example", "example/simple", "1.0.0");
    await contracts.publish(
        JSON.stringify({
            ...original!.release,
            version: "1.1.0",
            events: [
                { id: "entry.created", sensitive: false, schema: { type: "object", properties: {}, required: [] } },
            ],
        }),
    );
    await completeReceipt(f.destination, f.version, f.revision, f.images);
    const remoteRoot = join(f.root, "receiver");
    const registry = new FilesystemRepositoryPublicationRegistry(remoteRoot);
    let supportsEvents = false;
    const application = repositoryApplication(remoteRoot, "receiver", {
        publish(envelope) {
            if (!supportsEvents && envelope.kind === "contract" && JSON.parse(envelope.canonicalJson).events?.length) {
                throw new ReleaseValidationError("invalid_contract", 'unknown property "events"', "$.events");
            }
            return registry.publish(envelope);
        },
        setYank: (...args) => registry.setYank(...args),
    });
    const owner = await application.account();
    await application.namespaces.claim(owner.accountId, "example");
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => application.handle(request) });
    const credential = {
        origin: server.url.origin,
        repositoryId: application.repositoryId,
        namespace: "example",
        revision: 1,
        resolveToken: async () => owner.token,
    };
    const imageStores = f.images.map((image) => ({ image, registry: registryFixture(image) }));
    const remoteImages: PublicationPorts["remoteImages"] = async (images) =>
        prepareImagePublication(images, {
            fetch: async (url, init) => {
                const component = decodeURIComponent(url).includes("ulvia-provider") ? "provider" : "edge";
                return imageStores.find(({ image }) => image.component === component)!.registry.fetch(url, init);
            },
            run: async (args) => {
                const reference = args[1] === "image" ? args.at(-1) : args[2];
                const entry = imageStores.find(({ image }) => image.reference === reference)!;
                if (args[1] === "image") {
                    return entry.image.id;
                }
                entry.registry.writes.push(args.join(" "));
                entry.registry.put(entry.registry.runtime(entry.image.id));
            },
        });
    let catalogueAttempts = 0;
    const dependencies: PublicationPorts = {
        images: async () => f.images,
        remoteImages,
        npm: (archive, version) => prepareNpmPublication(archive, version, f.transport),
        run: async () => "npm fixture",
        repository: async () => {
            const records = await (await contracts.catalogue()).list();
            return {
                url: server.url.origin,
                coordinates: records.map(({ admission }) => ({
                    kind: "contract" as const,
                    publisherId: "example",
                    id: admission.release.contractId,
                    version: admission.release.version,
                })),
                publish: async () => {
                    catalogueAttempts++;
                    const client = new RemoteRepositoryClient(server.url.origin, credential);
                    for (const { admission } of records) {
                        const envelope: PublicationEnvelope = {
                            kind: "contract",
                            canonicalJson: admission.canonicalJson,
                            assets: [],
                        };
                        const result = await client.push(envelope);
                        if (result.digest !== admission.digest) {
                            throw new Error("Unexpected committed digest");
                        }
                    }
                },
            };
        },
    };
    return {
        ...f,
        imageStores,
        remoteFiles: new LocalArtifactFiles(remoteRoot),
        attempts: () => catalogueAttempts,
        upgradeReceiver: () => {
            supportsEvents = true;
        },
        publish: (phase: PublicationPhase) => publishDistribution(f.root, f.version, {}, dependencies, phase),
        close: async () => {
            server.stop(true);
            await application.close();
            await f.close();
        },
    };
}
