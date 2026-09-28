/**
 * SFC 自检：把每个 .vue 过一遍 @vue/compiler-sfc，抓「标签没闭合 / style 块被吃掉」这类
 * 只有跑起来才会炸的错误（vue-tsc 不一定报）。
 *
 *   cd rankpeek-frontend && node scripts/devtools/check-sfc.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse, compileTemplate } from '@vue/compiler-sfc'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

let failures = 0
for (const file of walk('src')) {
  const source = readFileSync(file, 'utf8')
  const { descriptor, errors } = parse(source, { filename: file })
  const problems = errors.map((error) => String(error.message))
  if (descriptor.template) {
    const compiled = compileTemplate({ source: descriptor.template.content, filename: file, id: 'check' })
    problems.push(...compiled.errors.map((error) => (typeof error === 'string' ? error : error.message)))
  }
  if (descriptor.styles.some((style) => style.content.trim().length === 0)) {
    problems.push('style block is empty (可能是 </style> 被吃掉了)')
  }
  if (problems.length > 0) {
    failures += 1
    console.log('FAIL ' + file)
    for (const problem of problems) console.log('   ' + problem)
  }
}
console.log(failures === 0 ? 'SFC CHECK PASS' : 'SFC CHECK FAIL: ' + failures + ' file(s)')
process.exit(failures === 0 ? 0 : 1)
