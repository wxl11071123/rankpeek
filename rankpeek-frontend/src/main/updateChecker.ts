import { app } from 'electron'
import { compareVersions } from 'compare-versions'

const LATEST_YML_URL = 'https://api.rankpeek.cn/download/latest.yml'
const DOWNLOAD_BASE = 'https://api.rankpeek.cn/download/'

export interface UpdateInfo {
  version: string
  url: string
}

const VERSION_RE = /^version:\s*(.+)$/m
const URL_RE = /^(?:path| {2}url):\s*(.+)$/m

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(LATEST_YML_URL)
    if (!res.ok) return null

    const yml = await res.text()
    const versionMatch = VERSION_RE.exec(yml)
    const urlMatch = URL_RE.exec(yml)

    if (!versionMatch || !urlMatch) return null

    const remoteVersion = versionMatch[1].trim()
    const localVersion = app.getVersion()

    if (compareVersions(remoteVersion, localVersion) <= 0) return null

    return {
      version: remoteVersion,
      url: DOWNLOAD_BASE + encodeURIComponent(urlMatch[1].trim()).replace(/%20/g, '%20')
    }
  } catch {
    return null
  }
}
