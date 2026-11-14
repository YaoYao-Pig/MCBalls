import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function assetFiles(directory) {
  const found = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await assetFiles(relative));
    else if (entry.isFile() && /\.(png|svg|html|json|md|js)$/.test(entry.name)) found.push(relative);
  }
  return found.sort();
}
const files = ['index.html', 'src/voxel.css', 'src/action-sidebar.css', 'src/arena-toolbar.css', 'src/world-ui.css', 'src/workbench.css', 'src/expedition-ui.css', 'src/ricochet.css', 'src/ricochet-ui.js', 'src/combat-feedback.js', 'src/combat-feedback.css', 'src/game-audio.js', 'src/beacon-ui.js', 'src/upgrade-target-ui.js', 'src/upgrade-target-ui.css', 'src/build-ui.js', 'src/build-ui.css', 'src/build-effects.js', 'src/combat-builds.js', 'src/beam-engine.js', 'src/aim-feedback.js', 'src/aim-feedback.css', 'src/enemy-scaling.js', 'src/wave-announcement.js', 'src/beacon.css', 'src/villager-workers.js', 'src/three-renderer.js', 'src/camera-framing.js', 'src/workbench-scene.js', 'src/workbench-ui.js', 'src/crafting-ui.js', 'src/crafting-scene.js', 'src/shader-world.js', 'src/shader-pipeline.js', 'src/realm-effects.js', 'src/minecraft-models.js', 'src/realm-models.js', 'src/app.js', 'src/core.js', 'src/storage.js', 'assets/icon.svg', ...await assetFiles('assets/minecraft'), ...await assetFiles('vendor')];
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
await mkdir(dist, { recursive: true }); await mkdir(release, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }

// A small standard ZIP writer using only Node built-ins. No tools, dependencies,
// account data or SDK credentials are placed in the Toy upload archive.
const localRecords = [], centralRecords = [], manifest = [];
let offset = 0;
for (const name of files) {
  const data = await readFile(path.join(root, name));
  if (name === 'index.html' && data.length > 1024 * 1024) throw new Error('index.html exceeds Toy entry size limit.');
  const dest = path.join(dist, name);
  await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, data);
  const filename = Buffer.from(name, 'utf8'), compressed = deflateRawSync(data), crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8); header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
  localRecords.push(header, filename, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(8, 10); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
  centralRecords.push(central, filename);
  offset += header.length + filename.length + compressed.length;
  manifest.push({ path: name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const directory = Buffer.concat(centralRecords), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...localRecords, directory, end]);
await writeFile(path.join(release, 'block-bounce-toy.zip'), archive);
await writeFile(path.join(release, 'manifest.json'), JSON.stringify({ name: '我的世界弹弹乐', version: '0.3.0', archiveBytes: archive.length, files: manifest }, null, 2) + '\n');
console.log(`Built ${files.length} files into dist/\nToy ZIP: release/block-bounce-toy.zip (${(archive.length / 1024).toFixed(1)} KB)\nEntry: index.html (${manifest[0].bytes} bytes)`);
