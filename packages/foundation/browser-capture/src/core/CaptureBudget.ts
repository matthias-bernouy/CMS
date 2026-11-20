import { CAPTURE_LIMITS, CaptureError } from "./limits";
/** Bounds the complete preparation/capture pipeline, without an unbounded waiting queue. */
export class CaptureBudget {
    private active = 0;
    async run<Value>(work: () => Promise<Value>): Promise<Value> {
        if (this.active >= CAPTURE_LIMITS.concurrent) {
            throw new CaptureError("BUSY");
        }
        this.active++;
        try {
            return await work();
        } finally {
            this.active--;
        }
    }
}
