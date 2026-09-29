import { ref, type Ref } from 'vue'

export type UpdateDownloadState = 'idle' | 'downloading' | 'downloaded' | 'error'
export type UpdateCheckOutcome = 'available' | 'latest' | 'failed'

export interface AppUpdateInfo {
  version: string
  url: string
}

export interface AppUpdateInstaller {
  updateInfo: Ref<AppUpdateInfo | null>
  checking: Ref<boolean>
  downloadState: Ref<UpdateDownloadState>
  downloadPercent: Ref<number>
  installerPath: Ref<string>
  checkUpdate: () => Promise<UpdateCheckOutcome>
  download: () => Promise<void>
  install: () => void
  reset: () => void
}

/**
 * 「检查更新 → 下载 → 安装并重启」的共用实现。
 *
 * 公告中心和设置页共用这一份：写两遍迟早会跑偏，而这里每一步都碰系统能力
 * （下载到临时目录、起批处理替换安装目录、退出应用），行为不一致是会出事的。
 *
 * 背景：设置页以前只有「检查更新」，点了最多显示一行「发现新版本 v1.1.2」，
 * 装不了 —— 用户还得自己去官网重下。
 */
export function useAppUpdateInstaller(): AppUpdateInstaller {
  const updateInfo = ref<AppUpdateInfo | null>(null)
  const checking = ref(false)
  const downloadState = ref<UpdateDownloadState>('idle')
  const downloadPercent = ref(0)
  const installerPath = ref('')
  let cleanupProgress: (() => void) | null = null

  function stopProgressListener(): void {
    cleanupProgress?.()
    cleanupProgress = null
  }

  async function checkUpdate(): Promise<UpdateCheckOutcome> {
    if (checking.value) {
      return updateInfo.value ? 'available' : 'latest'
    }
    checking.value = true
    try {
      const info = await window.electronAPI?.checkUpdate?.()
      if (info && info.version) {
        updateInfo.value = info
        // 换了一个版本就当作还没下过，别拿着上一版的文件去装
        if (downloadState.value !== 'downloading') {
          downloadState.value = 'idle'
          downloadPercent.value = 0
          installerPath.value = ''
        }
        return 'available'
      }
      updateInfo.value = null
      reset()
      return 'latest'
    } catch {
      return 'failed'
    } finally {
      checking.value = false
    }
  }

  async function download(): Promise<void> {
    const info = updateInfo.value
    if (!info?.url || downloadState.value === 'downloading') {
      return
    }
    downloadState.value = 'downloading'
    downloadPercent.value = 0
    stopProgressListener()
    cleanupProgress = window.electronAPI?.onDownloadProgress?.((progress) => {
      downloadPercent.value = progress.percent
    }) ?? null
    try {
      installerPath.value = await window.electronAPI?.downloadUpdate?.(info.url) ?? ''
      downloadState.value = installerPath.value ? 'downloaded' : 'error'
      if (downloadState.value === 'downloaded') {
        downloadPercent.value = 100
      }
    } catch {
      downloadState.value = 'error'
    } finally {
      stopProgressListener()
    }
  }

  function install(): void {
    if (installerPath.value) {
      void window.electronAPI?.installUpdate?.(installerPath.value)
    }
  }

  function reset(): void {
    downloadState.value = 'idle'
    downloadPercent.value = 0
    installerPath.value = ''
  }

  return {
    updateInfo,
    checking,
    downloadState,
    downloadPercent,
    installerPath,
    checkUpdate,
    download,
    install,
    reset
  }
}
