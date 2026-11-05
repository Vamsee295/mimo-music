// Run: npx tsx lib/local.check.ts — corrupt ID3 tags must not hang the import
import assert from "node:assert";
import { readTags } from "./local";

const hang = setTimeout(() => (console.error("FAIL: readTags hung"), process.exit(1)), 3000);
const id3 = (body: number[]) => new File([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, body.length, ...body])], "x.mp3");
const frame = (id: string, len: number[], data: number[]) => [...[...id].map((c) => c.charCodeAt(0)), ...len, 0, 0, ...data];

(async () => {
// v2.3 frame size with the top bit set → negative length
assert.deepEqual(await readTags(id3(frame("TIT2", [0x80, 0, 0, 4], [0, 65, 66, 67]))), {});
// APIC with no terminators anywhere
const apic = await readTags(id3(frame("APIC", [0, 0, 0, 4], [0, 105, 109, 103])));
assert.ok(apic.cover instanceof Blob);
// a normal title still reads
assert.equal((await readTags(id3(frame("TIT2", [0, 0, 0, 4], [0, 72, 105, 33])))).title, "Hi!");

clearTimeout(hang);
console.log("local.check ok");
})();
