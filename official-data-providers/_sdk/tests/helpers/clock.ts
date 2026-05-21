/**
 * Deterministic clock for auth tests (exp/iat/skew, cache TTLs). The SDK's
 * verification (phase 03) takes an injected `now: () => number` (epoch
 * seconds) so tests can freeze/advance time without real waits.
 */
export interface TestClock {
    nowSec(): number;
    advance(seconds: number): void;
    set(seconds: number): void;
}

export function makeClock(startSec = 1_700_000_000): TestClock {
    let t = startSec;
    return {
        nowSec: () => t,
        advance: (s) => { t += s; },
        set:     (s) => { t = s; },
    };
}
