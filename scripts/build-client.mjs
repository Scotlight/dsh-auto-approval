import { mkdir, readFile, writeFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/client/index.js', import.meta.url), 'utf8')
const output = [
  'window.__ModuleLoader__.load({',
  '  id: "dsh-guardian-approval",',
  '  factory: (require) => {',
  '    const module = { exports: {} };',
  '    const exports = module.exports;',
  source,
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n')

await mkdir(new URL('../lib', import.meta.url), { recursive: true })
await writeFile(new URL('../lib/client.js', import.meta.url), output, 'utf8')