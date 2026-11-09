import { createAcmeFixture, docker } from "./dockerFixture";

const image = process.env.ULVIA_TLS_TEST_IMAGE ?? "docker.io/cyaxis/ulvia-provider:0.1.0-guardrails";
const inspected = JSON.parse(await docker(["image", "inspect", image]));
const labels = inspected[0]?.Config?.Labels;
const revision = Bun.spawn(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
const head = (await new Response(revision.stdout).text()).trim();
if (
    (await revision.exited) ||
    labels?.["io.ulvia.component"] !== "provider" ||
    labels?.["io.ulvia.hosting-api"] !== "1" ||
    labels?.["org.opencontainers.image.revision"] !== head
) {
    throw new Error("Hosting TLS tests require a current candidate Provider image with the shared-hosting API");
}
const fixture = await createAcmeFixture(image);
try {
    await fixture.phase("fresh");
    await fixture.restart();
    await fixture.phase("restart");
} catch (error) {
    await fixture.diagnostics();
    throw error;
} finally {
    await fixture.close();
}
