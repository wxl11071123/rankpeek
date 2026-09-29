import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { t, type MessageKey } from '@/i18n'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
    meta: { titleKey: 'nav.home', keepAlive: true }
  },
  {
    path: '/gaming',
    name: 'Gaming',
    component: () => import('@/views/GamingView.vue'),
    meta: { titleKey: 'nav.gaming', keepAlive: false }
  },
  {
    path: '/opgg',
    name: 'OpggWindow',
    component: () => import('@/views/OpggWindowView.vue'),
    meta: { titleKey: 'nav.gaming', keepAlive: false, standalone: true }
  },
  {
    path: '/summoner',
    name: 'Summoner',
    component: () => import('@/views/SummonerView.vue'),
    meta: { titleKey: 'nav.summoner', keepAlive: true }
  },
  {
    path: '/match-history',
    name: 'MatchHistory',
    component: () => import('@/views/MatchHistoryView.vue'),
    meta: { titleKey: 'nav.matchHistory', keepAlive: false }
  },
  {
    path: '/ai-analysis',
    name: 'AiAnalysis',
    component: () => import('@/views/AiAnalysisView.vue'),
    meta: { titleKey: 'nav.aiAnalysis', keepAlive: false }
  },
  {
    path: '/hextech',
    name: 'Hextech',
    component: () => import('@/views/HextechView.vue'),
    meta: { titleKey: 'nav.hextech', keepAlive: false }
  },
  {
    path: '/overlay',
    name: 'HextechOverlay',
    component: () => import('@/views/OverlayView.vue'),
    meta: { titleKey: 'hextech.overlayTitle', keepAlive: false, standalone: true }
  },
  {
    path: '/reports/:id',
    name: 'CoachSummaryReport',
    component: () => import('@/views/CoachSummaryReportView.vue'),
    meta: { titleKey: 'nav.aiAnalysis', keepAlive: false }
  },
  {
    path: '/user-tag',
    redirect: '/summoner'
  },
  {
    path: '/tag-config',
    redirect: '/settings'
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { titleKey: 'nav.settings', keepAlive: false }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const titleKey = to.meta.titleKey as MessageKey | undefined
  document.title = titleKey ? `${t(titleKey)} - RankPeek` : 'RankPeek'
  next()
})

export default router
