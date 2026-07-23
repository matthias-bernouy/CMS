export type HllMode = "sparse" | "dense";

export type HllSnapshot = {
    precision: number;
    mode: HllMode;
    registers: ReadonlyArray<readonly [number, number]> | Uint8Array;
};
