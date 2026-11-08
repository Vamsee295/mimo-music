// Run: npx tsx lib/artColor.check.ts — Now Playing tint picks the cover's vivid colour
import assert from "node:assert";
import { vividColor } from "./artColor";

const px = (...cols: [number, number, number][]) => new Uint8ClampedArray(cols.flatMap(([r, g, b]) => [r, g, b, 255]));

// a red poster on mostly black: red wins, not muddy dark grey
const redOnBlack = vividColor(px(...Array(30).fill([5, 5, 5]), ...Array(6).fill([200, 30, 40])))!;
assert.ok(redOnBlack[0] > 150 && redOnBlack[1] < 80, `expected red, got ${redOnBlack}`);

// all grey → its plain average (no division by ~0)
assert.deepEqual(vividColor(px([100, 100, 100], [120, 120, 120])), [110, 110, 110]);

// fully transparent / empty → null
assert.equal(vividColor(new Uint8ClampedArray([0, 0, 0, 0])), null);
console.log("artColor ok");
