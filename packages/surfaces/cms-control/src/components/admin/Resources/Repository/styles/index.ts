import controls from "./controls.css" with { type: "text" };
import layout from "./layout.css" with { type: "text" };

export default `${layout as unknown as string}\n${controls as unknown as string}`;
