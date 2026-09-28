<script setup lang="ts">
defineProps<{
  title: string
  status: 'connected' | 'disconnected' | 'info' | 'rank'
  value: string
  subtitle?: string
  icon: string
}>()
</script>

<template>
  <div class="status-card" :class="status">
    <div class="card-icon">{{ icon }}</div>
    <div class="card-content">
      <div class="card-title">{{ title }}</div>
      <div class="card-value">{{ value }}</div>
      <div v-if="subtitle" class="card-subtitle">{{ subtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.status-card {
  display: flex;
  gap: 16px;
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  transition: transform 0.15s, box-shadow 0.15s;
}

.status-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-icon {
  font-size: 32px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.card-content {
  flex: 1;
}

.card-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.card-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

/* 状态样式 */
.status-card.connected .card-icon {
  background: rgba(46, 204, 113, 0.15);
}

.status-card.disconnected .card-icon {
  background: rgba(231, 76, 60, 0.15);
}

.status-card.rank .card-icon {
  background: rgba(155, 89, 182, 0.15);
}
</style>
