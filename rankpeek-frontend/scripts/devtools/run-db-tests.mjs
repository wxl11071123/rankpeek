#!/usr/bin/env node
/**
 * Run the local SQLite tests (src/main/database/**.test.ts).
 *
 * better-sqlite3 is a native module. The app builds it for Electron's ABI through the
 * "postinstall" script (electron-builder install-app-deps), while plain "node --test" needs
 * the ABI of the installed Node - they are different, so the module cannot be loaded by both.
 * This script rebuilds it for Node, runs the database tests, and always restores the Electron
 * build afterwards (even when the tests fail or are interrupted).
 *
 * Usage: npm run test:db
 */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEST_PATTERN = 'src/main/database/**/*.test.ts'

function run(command, args) {
  return spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit', shell: true })
}

console.log('[test:db] rebuilding better-sqlite3 for ' + process.version + ' (this takes a minute)')
const rebuild = run('npm', ['rebuild', 'better-sqlite3'])

let status = 1
try {
  if (rebuild.status !== 0) {
    console.error('[test:db] rebuilding better-sqlite3 failed - is a C++ toolchain available?')
  } else {
    const tests = run('node', ['--test', TEST_PATTERN])
    status = tests.status ?? 1
  }
} finally {
  console.log('[test:db] restoring the Electron ABI for the app runtime')
  const restore = run('npm', ['run', 'electron:rebuild'])
  if (restore.status !== 0) {
    console.error('[test:db] WARNING: could not restore the Electron build - run "npm run electron:rebuild" before starting the app')
  }
}

process.exit(status)
