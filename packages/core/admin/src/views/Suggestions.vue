<template>
  <div style="background: #fff; padding: 24px; border-radius: 8px;">
    <h3 style="margin: 0 0 16px; font-size: 18px;">建议中心</h3>
    <el-table :data="suggestions" style="width: 100%;" v-loading="loading">
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="severity" label="严重程度" width="100">
        <template #default="{ row }">
          <el-tag :type="row.severity === 'high' ? 'danger' : row.severity === 'medium' ? 'warning' : 'info'" size="small">
            {{ row.severity }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'accepted' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'" size="small">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button text type="primary" size="small" @click="accept(row.id)">接受</el-button>
            <el-button text type="danger" size="small" @click="reject(row.id)">拒绝</el-button>
          </template>
          <template v-else-if="row.status === 'accepted'">
            <el-button text type="success" size="small" @click="execute(row.id)">执行</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'
import type { Suggestion } from '@/types'

const suggestions = ref<Suggestion[]>([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const res = await api.getSuggestions()
    if (res.data) suggestions.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
})

async function accept(id: string) {
  try {
    await api.acceptSuggestion(id)
    const item = suggestions.value.find((s) => s.id === id)
    if (item) item.status = 'accepted'
    ElMessage.success('已接受')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

async function reject(id: string) {
  try {
    await api.rejectSuggestion(id)
    const item = suggestions.value.find((s) => s.id === id)
    if (item) item.status = 'rejected'
    ElMessage.success('已拒绝')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

async function execute(id: string) {
  try {
    await api.executeSuggestion(id)
    ElMessage.success('已执行')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '执行失败')
  }
}
</script>
