<template>
  <div style="background: #fff; padding: 24px; border-radius: 8px;">
    <h3 style="margin: 0 0 16px; font-size: 18px;">容器管理</h3>

    <el-table :data="containers" style="width: 100%;" v-loading="loading" @row-click="showMembers">
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="path" label="路径" />
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button text type="primary" size="small" @click.stop="handleScan(row)">扫描</el-button>
          <el-button text size="small" @click.stop="showMembers(row)">成员</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 成员对话框 -->
    <el-dialog v-model="membersVisible" :title="`容器成员 — ${selectedContainer?.name || ''}`" width="640px">
      <el-table :data="members" style="width: 100%;" max-height="400px">
        <el-table-column prop="path" label="路径" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button text size="small" type="primary" @click="handlePromote(row)">升级</el-button>
            <el-button text size="small" type="warning" @click="handleDemote(row)">降级</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'
import type { Container, ContainerMember } from '@/types'

const containers = ref<Container[]>([])
const loading = ref(false)
const membersVisible = ref(false)
const members = ref<ContainerMember[]>([])
const selectedContainer = ref<Container | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    const res = await api.getContainers()
    if (res.data) containers.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
})

async function handleScan(row: Container) {
  try {
    await api.scanContainer(row.id)
    ElMessage.success('扫描完成')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '扫描失败')
  }
}

async function showMembers(row: Container) {
  selectedContainer.value = row
  try {
    const res = await api.getContainerMembers(row.id)
    const d: any = res.data?.data
    if (d) members.value = d.members || d.data || []
    membersVisible.value = true
  } catch {}
}

async function handlePromote(row: ContainerMember) {
  if (!selectedContainer.value) return
  try {
    await api.promoteMember(selectedContainer.value.id, row.path)
    ElMessage.success('已升级')
    showMembers(selectedContainer.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '升级失败')
  }
}

async function handleDemote(row: ContainerMember) {
  if (!selectedContainer.value) return
  try {
    await api.demoteMember(selectedContainer.value.id, row.path)
    ElMessage.success('已降级')
    showMembers(selectedContainer.value)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '降级失败')
  }
}
</script>
