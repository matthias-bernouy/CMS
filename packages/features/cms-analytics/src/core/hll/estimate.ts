const ALPHA_INFINITY = 0.7213475204444817;

export function estimateCardinality(registers: Uint8Array): number {
    const registerCount = registers.length;
    let zeros = 0;
    let harmonic = 0;
    for (const register of registers) {
        if (register === 0) {
            zeros++;
        }
        harmonic += 2 ** -register;
    }

    if (zeros > 0) {
        const linear = registerCount * Math.log(registerCount / zeros);
        if (linear <= 2.5 * registerCount) {
            return linear;
        }
    }

    const beta = logLogBeta(zeros);
    return (ALPHA_INFINITY * registerCount * (registerCount - zeros)) / (beta + harmonic);
}

/**
 * LogLog-Beta removes the original estimator's transition-region bias without
 * retaining per-value material or shipping large empirical tables.
 */
function logLogBeta(zeros: number): number {
    const log = Math.log(zeros + 1);
    return (
        -0.370393911 * zeros +
        0.070471823 * log +
        0.17393686 * log ** 2 +
        0.16339839 * log ** 3 -
        0.09237745 * log ** 4 +
        0.03738027 * log ** 5 -
        0.005384159 * log ** 6 +
        0.00042419 * log ** 7
    );
}
