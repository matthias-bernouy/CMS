import type { LocalReleaseVerificationInput, LocalReleaseVerifier } from "./types";
import { runAuthorTests } from "./author-tests";
import { runReleaseScenario } from "./sandbox/scenario";

export class RuntimeLocalReleaseVerifier implements LocalReleaseVerifier {
    constructor(private readonly log: (message: string) => void) {}

    async verify(input: LocalReleaseVerificationInput): Promise<void> {
        const packages = [input.candidate, ...input.baselines, ...input.availablePackages];
        const coordinate = `${input.candidate.package.envelope.kind}@${input.candidate.package.envelope.version}`;
        if (await runAuthorTests(input.sourceRoot)) {
            this.log(`✓ source tests passed for ${coordinate}`);
        }
        this.log(`… verifying fresh installation of ${coordinate}`);
        await runReleaseScenario({ target: input.candidate, packages });
        for (const baseline of input.baselines) {
            const from = baseline.package.envelope.version;
            this.log(`… verifying upgrade ${from} → ${input.candidate.package.envelope.version}`);
            await runReleaseScenario({ target: input.candidate, baseline, packages });
        }
        this.log(`✓ runtime verification passed for ${1 + input.baselines.length} scenario(s)`);
    }
}
