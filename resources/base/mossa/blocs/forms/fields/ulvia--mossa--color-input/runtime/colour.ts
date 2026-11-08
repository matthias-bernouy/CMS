export type Rgb = { red: number; green: number; blue: number };
export type ColourMode = "hex" | "rgb" | "hsl" | "hsv" | "cmyk";

export const MODES: ColourMode[] = ["hex", "rgb", "hsl", "hsv", "cmyk"];

const clamp = (value: number, maximum: number): number => Math.min(maximum, Math.max(0, value));

export function normalizeHex(value: string): string | null {
    const compact = value.trim().replace(/^#/, "");
    const expanded = /^[0-9a-f]{3}$/i.test(compact)
        ? compact
              .split("")
              .map((character) => `${character}${character}`)
              .join("")
        : compact;
    return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toLowerCase()}` : null;
}

export function hexToRgb(value: string): Rgb {
    const hex = normalizeHex(value) ?? "#000000";
    return {
        red: Number.parseInt(hex.slice(1, 3), 16),
        green: Number.parseInt(hex.slice(3, 5), 16),
        blue: Number.parseInt(hex.slice(5, 7), 16),
    };
}

export function rgbToHex({ red, green, blue }: Rgb): string {
    return `#${[red, green, blue]
        .map((value) => Math.round(clamp(value, 255)).toString(16).padStart(2, "0"))
        .join("")}`;
}

export function rgbToHsl({ red, green, blue }: Rgb): number[] {
    const [r, g, b] = [red, green, blue].map((value) => value / 255);
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    let hue = 0;
    if (delta) {
        hue = maximum === r ? ((g - b) / delta) % 6 : maximum === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    }
    const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
    return [Math.round((hue * 60 + 360) % 360), Math.round(saturation * 100), Math.round(lightness * 100)];
}

export function hslToRgb([hue, saturation, lightness]: number[]): Rgb {
    const h = ((hue % 360) + 360) % 360;
    const s = clamp(saturation, 100) / 100;
    const l = clamp(lightness, 100) / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const [first, second, third] = colourSection(h, chroma);
    const match = l - chroma / 2;
    return { red: (first + match) * 255, green: (second + match) * 255, blue: (third + match) * 255 };
}

export function rgbToHsv({ red, green, blue }: Rgb): number[] {
    const [r, g, b] = [red, green, blue].map((value) => value / 255);
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    let hue = 0;
    if (delta) {
        hue = maximum === r ? ((g - b) / delta) % 6 : maximum === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    }
    return [
        Math.round((hue * 60 + 360) % 360),
        Math.round((maximum ? delta / maximum : 0) * 100),
        Math.round(maximum * 100),
    ];
}

export function hsvToRgb([hue, saturation, value]: number[]): Rgb {
    const h = ((hue % 360) + 360) % 360;
    const v = clamp(value, 100) / 100;
    const chroma = v * (clamp(saturation, 100) / 100);
    const [first, second, third] = colourSection(h, chroma);
    const match = v - chroma;
    return { red: (first + match) * 255, green: (second + match) * 255, blue: (third + match) * 255 };
}

export function rgbToCmyk({ red, green, blue }: Rgb): number[] {
    const [r, g, b] = [red, green, blue].map((value) => value / 255);
    const black = 1 - Math.max(r, g, b);
    if (black === 1) {
        return [0, 0, 0, 100];
    }
    return [
        Math.round(((1 - r - black) / (1 - black)) * 100),
        Math.round(((1 - g - black) / (1 - black)) * 100),
        Math.round(((1 - b - black) / (1 - black)) * 100),
        Math.round(black * 100),
    ];
}

export function cmykToRgb([cyan, magenta, yellow, black]: number[]): Rgb {
    const [c, m, y, k] = [cyan, magenta, yellow, black].map((value) => clamp(value, 100) / 100);
    return { red: 255 * (1 - c) * (1 - k), green: 255 * (1 - m) * (1 - k), blue: 255 * (1 - y) * (1 - k) };
}

function colourSection(hue: number, chroma: number): [number, number, number] {
    const section = hue / 60;
    const second = chroma * (1 - Math.abs((section % 2) - 1));
    if (section < 1) {
        return [chroma, second, 0];
    }
    if (section < 2) {
        return [second, chroma, 0];
    }
    if (section < 3) {
        return [0, chroma, second];
    }
    if (section < 4) {
        return [0, second, chroma];
    }
    if (section < 5) {
        return [second, 0, chroma];
    }
    return [chroma, 0, second];
}
