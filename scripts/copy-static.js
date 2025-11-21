import { cp } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = path.resolve('.');
const distDir = path.join(workspaceRoot, 'dist');
const extensionDir = path.join(workspaceRoot, 'extension');

const assets = ['manifest.json', 'icons', 'content'];

async function main() {
  for (const asset of assets) {
    const src = path.join(extensionDir, asset);
    const dest = path.join(distDir, asset);
    await cp(src, dest, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error('[copy-static] 拷贝资源失败：', error);
  process.exit(1);
});


