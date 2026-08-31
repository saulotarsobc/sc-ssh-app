import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const publicDirectory = path.resolve(import.meta.dirname, "..", "public");
const source = await readFile(path.join(publicDirectory, "icon.svg"));
const png = await sharp(source).resize(1024, 1024).png().toBuffer();
await writeFile(path.join(publicDirectory, "icon.png"), png);

const icoImages = await Promise.all(
  [16, 24, 32, 48, 64, 128, 256].map((size) =>
    sharp(source).resize(size, size).png().toBuffer(),
  ),
);
await writeFile(
  path.join(publicDirectory, "icon.ico"),
  await pngToIco(icoImages),
);

console.log("Generated public/icon.png and public/icon.ico");
