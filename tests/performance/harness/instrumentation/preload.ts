import { createRequire } from "node:module";
import { instrumentDispatcher } from "./dispatch";
import { instrumentMongo } from "./mongo";
import { instrumentNetwork } from "./network";
import { instrumentBinding } from "./binding";
import { instrumentOperations } from "./operation";
import { instrumentInitialization, measureInitializationMethod } from "./initialization";

const provider = Bun.main.endsWith("/ulvia-provider-server/src/index.ts");
const runtime = provider ? "ulvia-provider-server" : "cms-edge-server";
const workspace = createRequire(`/app/packages/runtimes/${runtime}/package.json`);
const { currentTraceContext } = workspace("@bernouy/logging/tracing");
const currentTrace = () => currentTraceContext()?.traceId;
instrumentNetwork(currentTrace);
instrumentBinding(workspace("@bernouy/cms-gateway").CapabilityGateway.prototype, currentTrace);
if (provider) {
    const installations = workspace("@bernouy/repository/collections/installations");
    instrumentInitialization(installations.SiteInitializationService.prototype);
    measureInitializationMethod(installations.MemoryCollectionStorage.prototype, "putRelease", "preview.store");
    const content = workspace("@bernouy/content").ValidatingContentRepository.prototype;
    measureInitializationMethod(content, "insertPage", "content.insertPage");
    measureInitializationMethod(content, "updatePage", "content.updatePage");
    measureInitializationMethod(
        workspace("@bernouy/repository/contracts/mongo").MongoReleaseCatalogue.prototype,
        "get",
        "contracts.get",
    );
    instrumentOperations(workspace("@bernouy/ulvia-provider").ProviderOperationExecutor.prototype);
    instrumentDispatcher(
        workspace("@bernouy/cms-gateway/provider/server").DefaultProviderCapabilityDispatcher.prototype,
    );
    instrumentMongo(workspace("mongodb"), currentTrace);
}
