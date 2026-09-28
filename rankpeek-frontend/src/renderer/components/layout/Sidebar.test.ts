import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const testDir = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(testDir, '../..')

function readRendererFile(path: string) {
  return readFileSync(resolve(rendererRoot, path), 'utf8')
}

function extractRule(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\}`))

  assert.ok(match?.groups?.body, `${selector} rule should exist`)

  return match.groups.body
}

test('sidebar uses standalone branding artwork and line icons', () => {
  const source = readRendererFile('components/layout/Sidebar.vue')

  assert.match(source, /const menuItems: Array<\{ path: string; iconSvg: string; labelKey: MessageKey \}>/)
  assert.match(source, /import homeIconSvg from '@\/assets\/icons\/nav-home\.svg\?raw'/)
  assert.match(source, /import gamingIconSvg from '@\/assets\/icons\/nav-gamepad\.svg\?raw'/)
  assert.match(source, /import summonerIconSvg from '@\/assets\/icons\/nav-user-search\.svg\?raw'/)
  assert.match(source, /import matchRecordIconSvg from '@\/assets\/icons\/nav-record-bars\.svg\?raw'/)
  assert.match(source, /import settingsGearIconSvg from '@\/assets\/icons\/nav-gear-five\.svg\?raw'/)
  assert.match(source, /import sidebarLogo from '@\/assets\/branding\/sidebar-logo\.png'/)
  assert.match(source, /\{ path: '\/match-history', iconSvg: matchRecordIconSvg, labelKey: 'nav.matchHistory' \}/)
  assert.match(source, /\{ path: '\/settings', iconSvg: settingsGearIconSvg, labelKey: 'nav.settings' \}/)
  assert.match(source, /class="sidebar-brand"/)
  assert.match(source, /class="sidebar-logo"/)
  assert.doesNotMatch(source, /<svg[\s\S]*class="sidebar-logo"/)
  assert.doesNotMatch(source, /src="\/icon\.png"/)
  assert.match(source, /<img class="sidebar-logo" :src="sidebarLogo" alt="" aria-hidden="true" \/>/)
  assert.match(source, /\.sidebar-logo\s*{[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;/)
  assert.match(source, /\.sidebar-logo\s*{[\s\S]*border-radius:\s*8px;/)
  assert.match(source, /\.sidebar-logo\s*{[\s\S]*object-fit:\s*contain;/)
  assert.doesNotMatch(source, /\.sidebar-logo\s*{[\s\S]*mix-blend-mode:/)
  assert.doesNotMatch(source, /:global\(\[data-theme="(?:dark|light)"\]\s+\.sidebar-logo\)/)
  assert.match(source, /<span class="nav-icon-svg" v-html="item\.iconSvg"><\/span>/)
  assert.doesNotMatch(source, /--nav-icon-url/)
  assert.doesNotMatch(source, /\.nav-icon-svg\s*{[\s\S]*background:\s*currentColor;/)
  assert.doesNotMatch(source, /\.nav-icon-svg\s*{[\s\S]*(?:-webkit-)?mask:/)
  assert.doesNotMatch(source, /🏠|🎮|👤|📊|🏷️|📝|🔧/)
})

test('match-history nav label is renamed to my matches', () => {
  const zhCN = readRendererFile('i18n/locales/zh-CN.ts')
  const enUS = readRendererFile('i18n/locales/en-US.ts')

  assert.match(zhCN, /'nav.matchHistory': '我的战绩'/)
  assert.doesNotMatch(zhCN, /'nav.matchHistory': '召唤师信息'/)
  assert.match(enUS, /'nav.matchHistory': 'My Matches'/)
  assert.doesNotMatch(enUS, /'nav.matchHistory': 'Summoner Info'/)
})

test('sidebar retires standalone tag analysis and tag config entries', () => {
  const source = readRendererFile('components/layout/Sidebar.vue')

  assert.doesNotMatch(source, /import userTagIcon/)
  assert.doesNotMatch(source, /import tagConfigIcon/)
  assert.doesNotMatch(source, /path: '\/user-tag'/)
  assert.doesNotMatch(source, /path: '\/tag-config'/)
  assert.doesNotMatch(source, /labelKey: 'nav\.userTag'/)
  assert.doesNotMatch(source, /labelKey: 'nav\.tagConfig'/)
  assert.match(source, /path: '\/', iconSvg: homeIconSvg, labelKey: 'nav\.home'/)
  assert.match(source, /path: '\/gaming', iconSvg: gamingIconSvg, labelKey: 'nav\.gaming'/)
  assert.match(source, /path: '\/summoner', iconSvg: summonerIconSvg, labelKey: 'nav\.summoner'/)
  assert.match(source, /path: '\/match-history', iconSvg: matchRecordIconSvg, labelKey: 'nav\.matchHistory'/)
  assert.match(source, /path: '\/settings', iconSvg: settingsGearIconSvg, labelKey: 'nav\.settings'/)
})

test('sidebar nav items do not show native browser title tooltips', () => {
  const source = readRendererFile('components/layout/Sidebar.vue')
  const navItemBlock = source.match(/<li[\s\S]*?@click="navigateTo\(item\.path\)"[\s\S]*?>/)?.[0] || ''

  assert.match(navItemBlock, /:aria-label="t\(item\.labelKey\)"/)
  assert.doesNotMatch(navItemBlock, /:title=|title=/)
})

test('sidebar nav labels keep bold weight and size across states', () => {
  const source = readRendererFile('components/layout/Sidebar.vue')
  const activeRule = extractRule(source, '.nav-item.active')

  assert.match(source, /\.nav-item\s*{[\s\S]*font-size:\s*17px;[\s\S]*font-weight:\s*700;/)
  assert.match(source, /\.nav-item,\s*[\r\n\s]*\.nav-item:hover,\s*[\r\n\s]*\.nav-item\.active,\s*[\r\n\s]*\.nav-item:focus-visible\s*{[\s\S]*font-size:\s*17px;[\s\S]*font-weight:\s*700;/)
  assert.match(source, /\.nav-label\s*{[\s\S]*font-size:\s*inherit;[\s\S]*font-weight:\s*inherit;/)
  assert.doesNotMatch(activeRule, /font-weight:\s*(400|500|normal);/)
  assert.doesNotMatch(source, /transition:[^;]*(font|font-size|font-weight)/)
})

test('sidebar nav icons use independent theme colors across states', () => {
  const source = readRendererFile('components/layout/Sidebar.vue')
  const tokens = readRendererFile('assets/styles/main.css')
  const darkTheme = extractRule(tokens, '[data-theme="dark"]')
  const lightTheme = extractRule(tokens, '[data-theme="light"]')
  const navIconRule = extractRule(source, '.nav-icon')
  const activeIconRule = extractRule(source, '.nav-item.active .nav-icon')

  assert.match(darkTheme, /--color-nav-icon:\s*#d8b978;/)
  assert.match(darkTheme, /--color-nav-icon-hover:\s*#8bd7e8;/)
  assert.match(darkTheme, /--color-nav-icon-active:\s*#102a3d;/)
  assert.match(lightTheme, /--color-nav-icon:\s*#315f7f;/)
  assert.match(lightTheme, /--color-nav-icon-hover:\s*#9a6b1f;/)
  assert.match(lightTheme, /--color-nav-icon-active:\s*#092238;/)

  assert.match(navIconRule, /color:\s*var\(--color-nav-icon\);/)
  assert.match(navIconRule, /transition:\s*color var\(--transition-fast\);/)
  assert.match(
    source,
    /\.nav-item:hover\s+\.nav-icon,\s*[\r\n\s]*\.nav-item:focus-visible\s+\.nav-icon\s*{[\s\S]*color:\s*var\(--color-nav-icon-hover\);/
  )
  assert.match(activeIconRule, /color:\s*var\(--color-nav-icon-active\);/)
  assert.doesNotMatch(activeIconRule, /color:\s*(currentColor|var\(--text-primary\)|var\(--text-secondary\)|#ffffff);/)
})

test('sidebar exposes a resize handle wired to persisted width state', () => {
  const source = readRendererFile('components/layout/Sidebar.vue')

  assert.match(source, /import \{ useResizableSidebar \} from '@\/composables\/useResizableSidebar'/)
  assert.match(source, /const sidebarElement = ref<HTMLElement \| null>\(null\)/)
  assert.match(source, /useResizableSidebar\(sidebarElement\)/)
  assert.match(source, /onBeforeUnmount\(cleanupSidebarResize\)/)
  assert.match(source, /<aside[\s\S]*ref="sidebarElement"[\s\S]*:style="sidebarStyle"/)
  assert.match(source, /class="sidebar-resize-handle"/)
  assert.match(source, /role="separator"/)
  assert.match(source, /aria-orientation="vertical"/)
  assert.match(source, /:aria-valuemin="MIN_SIDEBAR_WIDTH"/)
  assert.match(source, /:aria-valuemax="MAX_SIDEBAR_WIDTH"/)
  assert.match(source, /:aria-valuenow="sidebarWidth"/)
  assert.match(source, /@mousedown="startResize"/)
})

test('sidebar resize handle styling is subtle and keeps mobile navigation compact', () => {
  const source = readRendererFile('components/layout/Sidebar.vue')
  const sidebarRule = extractRule(source, '.sidebar')
  const handleRule = extractRule(source, '.sidebar-resize-handle')
  const handleLineRule = extractRule(source, '.sidebar-resize-handle::after')

  assert.match(sidebarRule, /width:\s*var\(--sidebar-width,\s*252px\);/)
  assert.match(sidebarRule, /flex:\s*0 0 var\(--sidebar-width,\s*252px\);/)
  assert.match(sidebarRule, /min-width:\s*200px;/)
  assert.match(sidebarRule, /max-width:\s*340px;/)
  assert.match(handleRule, /cursor:\s*col-resize;/)
  assert.match(handleRule, /right:\s*-3px;/)
  assert.match(handleLineRule, /background:\s*var\(--border-subtle\);/)
  assert.match(source, /:global\(body\.sidebar-resizing\)/)
  assert.match(source, /user-select:\s*none !important;/)
  assert.match(source, /cursor:\s*col-resize !important;/)
  assert.match(source, /@media \(max-width: 760px\)\s*{[\s\S]*\.sidebar\s*{[\s\S]*width:\s*96px;[\s\S]*flex:\s*0 0 96px;/)
  assert.match(source, /@media \(max-width: 760px\)\s*{[\s\S]*\.sidebar-resize-handle\s*{[\s\S]*display:\s*none;/)
})

test('new requested sidebar icons are current-color linear svg files', () => {
  const iconRoot = resolve(rendererRoot, 'assets/icons')
  const requestedIcons = ['nav-record-bars.svg', 'nav-gear-five.svg']

  for (const iconName of requestedIcons) {
    const iconPath = resolve(iconRoot, iconName)
    assert.equal(existsSync(iconPath), true, `${iconName} should exist`)

    const svg = readFileSync(iconPath, 'utf8')
    assert.match(svg, /fill="none"/)
    assert.match(svg, /stroke="currentColor"/)
    assert.match(svg, /stroke-linecap="round"/)
    assert.match(svg, /stroke-linejoin="round"/)
  }

  const gear = readFileSync(resolve(iconRoot, 'nav-gear-five.svg'), 'utf8')
  assert.match(gear, /data-icon-name="settings-gear"/)
  assert.match(gear, /<path d="M12\.22 2h-\.44/)
  assert.match(gear, /V20a2 2 0 0 0 2 2h\.44/)
  assert.match(gear, /<circle cx="12" cy="12" r="3" \/>/)
})
