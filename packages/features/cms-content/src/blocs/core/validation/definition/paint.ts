/** Shared CSS paint channels; numeric longhands deliberately stay outside this set. */
export function blocStylePaintProperty(property: string): boolean {
    const name = property
        .replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)
        .replace(/^-?(?:webkit|moz|ms|o)-/u, "");
    if (name.endsWith("-color") || name.endsWith("-colors")) {
        return true;
    }
    return /^(?:color|text-stroke|background(?:-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|border-image(?:-source)?|outline|box-reflect|(?:box|text)-shadow|fill|stroke|text-(?:decoration|emphasis)|column-rule|(?:backdrop-)?filter|mask(?:-image|-border(?:-source)?)?)$/u.test(
        name,
    );
}
