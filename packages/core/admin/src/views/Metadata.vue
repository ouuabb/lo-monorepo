<template>
  <div>
    <h3 style="margin: 0 0 8px; font-size: 18px;">元数据管理</h3>
    <p style="margin: 0 0 16px; font-size: 13px; color: #999; line-height: 1.8;">
      类型、标签、分类统称为<strong>元数据</strong>——它们是资源的属性值，而非独立实体。非独立实体意味着它们没有自己的表，
      只是 resources 表 metadata 列中的字段（tags / category / type）。重命名或删除一项元数据，本质上是在 <strong>批量 UPDATE resources</strong>，
      而非操作一张独立的标签表或分类表。
    </p>

    <div style="background: #fff; padding: 24px; border-radius: 8px;">
      <el-tabs v-model="tab">
        <el-tab-pane label="类型" name="types">
          <el-table :data="types" style="width: 100%;" v-loading="loadingTypes">
            <el-table-column prop="type" label="类型名" min-width="200" />
            <el-table-column prop="count" label="资源数" width="120" align="center" />
            <el-table-column label="操作" width="160" align="center">
              <template #default="{ row }">
                <el-button size="small" @click="openRename('type', row.type, row.count)">重命名</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="标签" name="tags">
          <el-table :data="tags" style="width: 100%;" v-loading="loadingTags">
            <el-table-column prop="tag" label="标签名" min-width="200" />
            <el-table-column prop="count" label="使用次数" width="120" align="center" />
            <el-table-column label="操作" width="240" align="center">
              <template #default="{ row }">
                <el-button size="small" @click="openRename('tag', row.tag, row.count)">重命名</el-button>
                <el-button size="small" type="danger" @click="confirmDelete('tag', row.tag, row.count)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="分类" name="categories">
          <el-table :data="categories" style="width: 100%;" v-loading="loadingCats">
            <el-table-column prop="category" label="分类路径" min-width="240" />
            <el-table-column prop="count" label="资源数" width="120" align="center" />
            <el-table-column label="操作" width="240" align="center">
              <template #default="{ row }">
                <el-button size="small" @click="openRename('category', row.category, row.count)">重命名</el-button>
                <el-button size="small" type="danger" @click="confirmDelete('category', row.category, row.count)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="renameVisible" title="重命名" width="400px">
      <p>将 <strong>{{ renameOld }}</strong> 改名为：</p>
      <el-input v-model="renameNew" placeholder="新名称" />
      <p style="margin-top: 12px; font-size: 13px; color: #999;">
        更新 {{ renameCount }} 个资源。
      </p>
      <template #footer>
        <el-button @click="renameVisible = false">取消</el-button>
        <el-button type="primary" @click="doRename" :disabled="!renameNew.trim()">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

const tab = ref('types')
const loadingTypes = ref(false)
const loadingTags = ref(false)
const loadingCats = ref(false)

const types = ref<{ type: string; count: number }[]>([])
const tags = ref<{ tag: string; count: number }[]>([])
const categories = ref<{ category: string; count: number }[]>([])

const renameVisible = ref(false)
const renameKind = ref<'type' | 'tag' | 'category'>('type')
const renameOld = ref('')
const renameNew = ref('')
const renameCount = ref(0)

onMounted(() => { loadTypes(); loadTags(); loadCats() })

async function loadTypes() {
  loadingTypes.value = true
  try { const r = await api.getTypes(); types.value = r.data.data } finally { loadingTypes.value = false }
}

async function loadTags() {
  loadingTags.value = true
  try { const r = await api.getTags(); tags.value = r.data.data } finally { loadingTags.value = false }
}

async function loadCats() {
  loadingCats.value = true
  try { const r = await api.getCategories(); categories.value = r.data.data } finally { loadingCats.value = false }
}

function openRename(kind: 'type' | 'tag' | 'category', name: string, count: number) {
  renameKind.value = kind
  renameOld.value = name
  renameNew.value = ''
  renameCount.value = count
  renameVisible.value = true
}

async function doRename() {
  try {
    const kind = renameKind.value
    const val = renameNew.value.trim()
    const res: any = kind === 'type'
      ? await api.renameType(renameOld.value, val)
      : kind === 'tag'
        ? await api.renameTag(renameOld.value, val)
        : await api.renameCategory(renameOld.value, val)
    const d = res.data
    ElMessage.success(`${d.oldType || d.oldTag || d.oldCategory} → ${val}，已更新 ${d.affected} 个资源`)
    renameVisible.value = false
    if (kind === 'type') loadTypes()
    else if (kind === 'tag') loadTags()
    else loadCats()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '重命名失败')
  }
}

async function confirmDelete(kind: 'tag' | 'category', name: string, count: number) {
  try {
    await ElMessageBox.confirm(
      `删除${kind === 'tag' ? '标签' : '分类'} "${name}"，将影响 ${count} 个资源，确定？`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const res: any = kind === 'tag' ? await api.deleteTag(name) : await api.deleteCategory(name)
    ElMessage.success(kind === 'tag'
      ? `已从 ${res.data.affected} 个资源中移除标签 "${name}"`
      : `已清空 ${res.data.affected} 个资源的分类`)
    if (kind === 'tag') loadTags(); else loadCats()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}
</script>
