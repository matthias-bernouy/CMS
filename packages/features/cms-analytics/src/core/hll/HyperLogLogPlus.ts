import { estimateCardinality } from "./estimate";
import type { HllMode, HllSnapshot } from "./types";

const HASH_BITS = 64;

export class HyperLogLogPlus {
    readonly precision: number;
    private readonly registerCount: number;
    private readonly sparseLimit: number;
    private sparse = new Map<number, number>();
    private dense: Uint8Array | null = null;

    constructor(precision = 12) {
        if (!Number.isInteger(precision) || precision < 4 || precision > 18) {
            throw new Error("HLL precision must be an integer between 4 and 18");
        }
        this.precision = precision;
        this.registerCount = 2 ** precision;
        this.sparseLimit = Math.floor(this.registerCount / 4);
    }

    get mode(): HllMode {
        return this.dense ? "dense" : "sparse";
    }

    addHex(hash: string): void {
        const register = hllRegisterFromHex(hash, this.precision);
        this.setRegister(register.index, register.rank);
    }

    addHash64(hash: bigint): void {
        const remainingBits = HASH_BITS - this.precision;
        const index = Number(hash >> BigInt(remainingBits));
        const remainderMask = (1n << BigInt(remainingBits)) - 1n;
        const remainder = hash & remainderMask;
        const rank = remainder === 0n ? remainingBits + 1 : remainingBits - bitLength(remainder) + 1;
        this.setRegister(index, rank);
    }

    setRegister(index: number, rank: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= this.registerCount) {
            throw new Error("HLL register index is out of bounds");
        }
        const maximumRank = HASH_BITS - this.precision + 1;
        if (!Number.isInteger(rank) || rank < 1 || rank > maximumRank) {
            throw new Error("HLL register rank is out of bounds");
        }
        if (this.dense) {
            this.dense[index] = Math.max(this.dense[index] ?? 0, rank);
            return;
        }
        this.sparse.set(index, Math.max(this.sparse.get(index) ?? 0, rank));
        if (this.sparse.size > this.sparseLimit) {
            this.toDense();
        }
    }

    merge(other: HyperLogLogPlus): void {
        if (other.precision !== this.precision) {
            throw new Error("cannot merge HLL sketches with different precision");
        }
        for (const [index, rank] of other.entries()) {
            this.setRegister(index, rank);
        }
    }

    estimate(): number {
        return Math.max(0, Math.round(estimateCardinality(this.toRegisterArray())));
    }

    entries(): Array<readonly [number, number]> {
        if (this.dense) {
            return Array.from(this.dense.entries()).filter((entry) => entry[1] > 0);
        }
        return [...this.sparse.entries()].sort((left, right) => left[0] - right[0]);
    }

    snapshot(): HllSnapshot {
        return this.dense
            ? { precision: this.precision, mode: "dense", registers: this.dense.slice() }
            : { precision: this.precision, mode: "sparse", registers: this.entries() };
    }

    static fromSnapshot(snapshot: HllSnapshot): HyperLogLogPlus {
        const sketch = new HyperLogLogPlus(snapshot.precision);
        const entries =
            snapshot.registers instanceof Uint8Array
                ? Array.from(snapshot.registers.entries())
                : [...snapshot.registers];
        for (const [index, rank] of entries) {
            if (rank > 0) {
                sketch.setRegister(index, rank);
            }
        }
        return sketch;
    }

    private toDense(): void {
        const registers = new Uint8Array(this.registerCount);
        for (const [index, rank] of this.sparse) {
            registers[index] = rank;
        }
        this.sparse = new Map();
        this.dense = registers;
    }

    private toRegisterArray(): Uint8Array {
        if (this.dense) {
            return this.dense;
        }
        const registers = new Uint8Array(this.registerCount);
        for (const [index, rank] of this.sparse) {
            registers[index] = rank;
        }
        return registers;
    }
}

export function hllRegisterFromHex(hash: string, precision = 12): { index: number; rank: number } {
    if (!/^[0-9a-f]{16,64}$/i.test(hash)) {
        throw new Error("HLL input must be a 64-bit or wider hexadecimal hash");
    }
    if (!Number.isInteger(precision) || precision < 4 || precision > 18) {
        throw new Error("HLL precision must be an integer between 4 and 18");
    }
    const value = BigInt(`0x${hash.slice(0, 16)}`);
    const remainingBits = HASH_BITS - precision;
    const index = Number(value >> BigInt(remainingBits));
    const remainderMask = (1n << BigInt(remainingBits)) - 1n;
    const remainder = value & remainderMask;
    const rank = remainder === 0n ? remainingBits + 1 : remainingBits - bitLength(remainder) + 1;
    return { index, rank };
}

function bitLength(value: bigint): number {
    return value.toString(2).length;
}
