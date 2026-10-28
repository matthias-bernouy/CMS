import { assertMaximum, benchmark, printResults } from "../benchmark";
import { createNetworkJourney } from "./networkTransportFixture";

export async function runNetworkTransportBenchmarks(): Promise<void> {
    const journey = await createNetworkJourney();
    try {
        const baseline = await networkRoundTrips(journey.cmsUrl, "two-hop round trip", 0, 1, journey.setDelay);
        const delayed10 = await networkRoundTrips(
            journey.cmsUrl,
            "round trip with 10 ms provider latency",
            10,
            1,
            journey.setDelay,
        );
        const delayed50 = await networkRoundTrips(
            journey.cmsUrl,
            "round trip with 50 ms provider latency",
            50,
            1,
            journey.setDelay,
        );
        const concurrent10 = await networkRoundTrips(
            journey.cmsUrl,
            "10 concurrent calls with 10 ms latency",
            10,
            10,
            journey.setDelay,
        );
        const concurrent50 = await networkRoundTrips(
            journey.cmsUrl,
            "50 concurrent calls with 10 ms latency",
            10,
            50,
            journey.setDelay,
        );
        printResults("Real loopback Edge -> Gateway -> Provider transport", [
            baseline,
            delayed10,
            delayed50,
            concurrent10,
            concurrent50,
        ]);
        assertMaximum("two-hop local round trip p95", baseline.p95Ms, 1_000);
        assertMaximum("50 ms injected-latency round trip p95", delayed50.p95Ms, 2_000);
        assertMaximum("50 concurrent two-hop calls p95", concurrent50.p95Ms, 5_000);
        if (delayed50.medianMs < 35) {
            throw new Error("The real-network benchmark did not observe the injected Provider latency");
        }
    } finally {
        journey.stop();
    }
}

async function networkRoundTrips(
    cmsUrl: string,
    name: string,
    expectedDelayMs: number,
    concurrency: number,
    setDelay: (delayMs: number) => void,
) {
    setDelay(expectedDelayMs);
    let sequence = 0;
    return benchmark(name, async () => {
        await Promise.all(
            Array.from({ length: concurrency }, async () => {
                const value = `${expectedDelayMs}-${sequence++}`;
                const response = await fetch(`${cmsUrl}/benchmark/call`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ value }),
                });
                const result = (await response.json()) as { kind?: string; output?: { value?: string } };
                if (!response.ok || result.kind !== "success" || result.output?.value !== value) {
                    throw new Error("Edge/Gateway/Provider benchmark returned an invalid response");
                }
            }),
        );
    });
}
