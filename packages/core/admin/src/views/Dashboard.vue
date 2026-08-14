<template>
  <div style="background: #fff; padding: 24px; border-radius: 8px;">
    <h3 style="margin: 0 0 16px; font-size: 18px;">仪表盘</h3>
    <el-row :gutter="16">
      <el-col :span="6" v-for="item in cards" :key="item.label">
        <el-card shadow="never">
          <div style="font-size: 14px; color: #909399;">{{ item.label }}</div>
          <div style="font-size: 28px; font-weight: 600; margin-top: 8px;">{{ item.value }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'
import type { Stats } from '@/types'

const stats = ref<Stats>({ resources: 0, relations: 0, tags: 0, categories: 0, suggestions: 0 })

const cards = [
  { label: '资源数', value: stats.value.resources },
  { label: '关系数', value: stats.value.relations },
  { label: '标签数', value: stats.value.tags },
  { label: '建议数', value: stats.value.suggestions }
]

onMounted(async () => {
  try {
    const res = await api.getStats()
    if (res.data.ok) stats.value = res.data.data
  } catch {}
})
</script>
