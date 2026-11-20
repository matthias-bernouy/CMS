import { statistics } from "../harness/measurements/statistics";

/** Fixture preparation and output verification are outside the measured operation. */
export async function measure<T, R>(
    name: string,
    prepare: () => T,
    run: (input: T) => R | Promise<R>,
    verify: (output: R) => void,
) {
    const samples: number[] = [];
    for (let index = 0; index < 120; index++) {
        const input = prepare();
        const start = performance.now();
        const output = await run(input);
        const elapsed = performance.now() - start;
        verify(output);
        if (index >= 20) {
            samples.push(elapsed);
        }
    }
    return { name, samplesMs: samples, ...statistics(samples) };
}
