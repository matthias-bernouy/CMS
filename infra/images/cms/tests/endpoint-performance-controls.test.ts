import { expect } from "bun:test";
import { composeTest, instanceComposeFile, renderCompose, requiredCmsEnvironment } from "./deployment-fixtures";

composeTest("forwards endpoint performance controls to the runtime", () => {
    const config = renderCompose(instanceComposeFile, {
        ...requiredCmsEnvironment,
        DOMAIN: "observability.example.test",
        MONGO_URL: "mongodb://cms_app:password@mongo:27017/cms_observability?authSource=admin",
        ENDPOINT_PERFORMANCE_ENABLED: "false",
        SOURCE_TIMING_SAMPLE_RATE: "0.25",
        SOURCE_SLOW_REQUEST_THRESHOLD_MS: "2500",
    });

    expect(config.services.cms.environment).toMatchObject({
        ENDPOINT_PERFORMANCE_ENABLED: "false",
        SOURCE_TIMING_SAMPLE_RATE: "0.25",
        SOURCE_SLOW_REQUEST_THRESHOLD_MS: "2500",
    });
});
