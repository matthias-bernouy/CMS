import type { FakeIssuer } from "tests/helpers/fakeIssuer";
import type { TestClock } from "tests/helpers/clock";
import { parseProviderConfig } from "src/core/schemas/providerConfig";
import { staticIssuerTrust } from "tests/helpers/staticIssuerTrust";
import { MemoryJtiStore } from "src/default-implementation/MemoryJtiStore";
import type { VerifierDeps } from "src/core/auth/verifyToken";
import type { AllowlistRole } from "src/interfaces/ProviderConfig";

export function deps(
    fi: FakeIssuer, clock: TestClock,
    role: AllowlistRole = "tenant", allowIss?: string,
): VerifierDeps {
    const cfg = parseProviderConfig({
        providerId: "prov-1",
        allowlist: [{ iss: allowIss ?? fi.iss, role }],
    });
    const now = () => clock.nowSec();
    return { config: cfg, issuerTrust: staticIssuerTrust(cfg.allowlist), jti: new MemoryJtiStore(now), now };
}

export const aligned = (
    fi: FakeIssuer, clock: TestClock, extra: Record<string, unknown> = {},
) => fi.mint({ aud: "prov-1", iat: clock.nowSec(), exp: clock.nowSec() + 120, ...extra });
