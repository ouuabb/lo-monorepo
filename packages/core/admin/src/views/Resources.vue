<template>
  <div style="background: #fff; padding: 24px; border-radius: 8px;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
      <h3 style="margin: 0; font-size: 18px;">资源管理</h3>
      <div style="display: flex; gap: 8px;">
        <el-input v-model="keyword" placeholder="搜索..." style="width: 240px;" clearable @input="search" />
        <el-button @click="showImport = true">导入</el-button>
        <el-button type="primary" @click="showCreate = true">创建</el-button>
      </div>
    </div>
    <el-table :data="resources" style="width: 100%;" v-loading="loading">
      <el-table-column prop="rid" label="RID" width="200" />
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column prop="updated" label="更新时间" width="180" />
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button text type="primary" @click="$router.push(`/resources/${row.rid}`)">详情</el-button>
          <el-button text type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建对话框 -->
    <el-dialog v-model="showCreate" title="创建笔记" width="480px">
      <div style="font-size: 12px; color: #999; margin-bottom: 16px;">
        创建资源限定为 note 类型（.md 文件）。其他类型请通过导入添加。
      </div>
      <el-form label-width="80px">
        <el-form-item label="文件名">
          <el-input v-model="createForm.name" placeholder="e.g. my-note" />
          <span style="margin-left: 8px; color: #999;">.md</span>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="createForm.title" placeholder="可选" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="createForm.content" type="textarea" :rows="8" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog v-model="showImport" title="导入文件" width="560px">
      <div style="font-size: 12px; color: #999; margin-bottom: 12px;">
        输入文件的绝对路径，每行一个。类型将根据文件扩展名自动推断。
      </div>
      <el-input
        v-model="importPaths"
        type="textarea"
        :rows="8"
        placeholder="C:\Users\admin\photo.jpg
D:\docs\report.pdf"
      />
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" @click="handleImport" :loading="importing">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import api from '@/api'
import type { Resource } from '@/types'

const resources = ref<Resource[]>([])
const keyword = ref('')
const loading = ref(false)
const showCreate = ref(false)
const showImport = ref(false)
const importing = ref(false)

const createForm = ref({ name: '', title: '', content: '' })
const importPaths = ref('')

onMounted(() => fetchResources())

async function fetchResources() {
  loading.value = true
  try {
    const res = await api.getResources()
    if (res.data) resources.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
}

async function search() {
  loading.value = true
  try {
    const fn = keyword.value ? api.searchResources(keyword.value) : api.getResources()
    const res = await fn
    if (res.data) resources.value = res.data.data || res.data
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!createForm.value.name) {
    ElMessage.warning('请输入文件名')
    return
  }
  try {
    await api.createResource({
      name: createForm.value.name,
      content: createForm.value.content,
      metadata: createForm.value.title ? { title: createForm.value.title } : undefined
    })
    ElMessage.success('创建成功')
    showCreate.value = false
    createForm.value = { name: '', title: '', content: '' }
    fetchResources()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '创建失败')
  }
}

async function handleImport() {
  const paths = importPaths.value
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)

  if (paths.length === 0) {
    ElMessage.warning('请输入至少一个文件路径')
    return
  }

  importing.value = true
  try {
    const { data: res } = await api.importFiles(paths)
    const r = res.data
    if (r.imported.length > 0) {
      ElMessage.success(`成功导入 ${r.imported.length} 个文件`)
    }
    if (r.failed.length > 0) {
      const msgs = r.failed.map((f: any) => `${f.path}: ${f.error}`).join('; ')
      ElMessage.warning(`失败 ${r.failed.length} 个: ${msgs}`)
    }
    showImport.value = false
    importPaths.value = ''
    fetchResources()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '导入失败')
  } finally {
    importing.value = false
  }
}

async function handleDelete(row: Resource) {
  try {
    await ElMessageBox.confirm(`确定删除 ${row.title || row.rid}？`, '确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.deleteResource(row.rid)
    ElMessage.success('已删除')
    fetchResources()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.error || '删除失败')
    }
  }
}
</script>
