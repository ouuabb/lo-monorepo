<template>
  <div style="background: #fff; padding: 24px; border-radius: 8px;">
    <h3 style="margin: 0 0 16px; font-size: 18px;">资源详情</h3>

    <div v-if="resource" style="display: flex; gap: 24px;">
      <!-- 左：基本信息 -->
      <div style="flex: 1; min-width: 0;">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="RID">{{ resource.rid }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ resource.type }}</el-descriptions-item>
          <el-descriptions-item label="标题">
            <template v-if="editTitle">
              <el-input
                v-model="form.title"
                size="small"
                style="width: 200px;"
                @keydown.enter="saveTitle"
                @blur="saveTitle"
              />
            </template>
            <template v-else>
              <span @dblclick="startEditTitle" style="cursor: pointer;">{{ resource.title || '-' }}</span>
            </template>
          </el-descriptions-item>
          <el-descriptions-item label="大小">{{ resource.size }}</el-descriptions-item>
          <el-descriptions-item label="Hash">{{ resource.hash }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ resource.created }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ resource.updated }}</el-descriptions-item>
        </el-descriptions>

        <!-- 内容 -->
        <div style="margin-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <strong>内容</strong>
            <el-button size="small" @click="editContent = !editContent">
              {{ editContent ? '取消' : '编辑' }}
            </el-button>
          </div>
          <template v-if="editContent">
            <el-input
              v-model="form.content"
              type="textarea"
              :rows="12"
              placeholder="输入内容..."
            />
            <div style="margin-top: 8px;">
              <el-button type="primary" size="small" @click="saveContent">保存</el-button>
            </div>
          </template>
          <template v-else>
            <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; font-size: 13px;">{{ resource.content || '(无内容)' }}</pre>
          </template>
        </div>

        <!-- 标签 -->
        <div style="margin-top: 16px;">
          <strong>标签</strong>
          <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            <el-tag
              v-for="t in tags"
              :key="t"
              closable
              size="small"
              @close="handleRemoveTag(t)"
            >
              {{ t }}
            </el-tag>
            <el-input
              v-if="addingTag"
              ref="tagInput"
              v-model="newTag"
              size="small"
              style="width: 100px;"
              placeholder="标签名"
              @keydown.enter="handleAddTag"
              @blur="handleAddTag"
            />
            <el-button v-else size="small" @click="startAddTag">+ 标签</el-button>
          </div>
        </div>

        <!-- 关系 -->
        <div style="margin-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <strong>关系</strong>
            <el-button size="small" @click="showLinkDialog = true">关联资源</el-button>
          </div>
          <template v-if="relations.length">
            <div
              v-for="r in relations"
              :key="r.id"
              style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: #f5f7fa; border-radius: 4px; margin-bottom: 4px;"
            >
              <span style="font-size: 13px;">
                <el-tag size="small" style="margin-right: 8px;">{{ r.type }}</el-tag>
                {{ r.from === resource.rid ? '→' : '←' }}
                <span style="font-family: monospace; margin-left: 8px;">{{ r.from === resource.rid ? r.to : r.from }}</span>
              </span>
              <el-button text size="small" style="color: #f56c6c;" @click="handleUnlink(r)">断开</el-button>
            </div>
          </template>
          <span v-else style="color: #909399; font-size: 13px;">暂无关系</span>
        </div>
      </div>

      <!-- 右：操作 -->
      <div style="width: 160px; flex-shrink: 0;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <el-button type="primary" @click="editContent = !editContent">{{ editContent ? '取消编辑' : '编辑内容' }}</el-button>
          <el-button type="success" @click="showLinkDialog = true">关联资源</el-button>
          <el-button type="danger" @click="handleDelete">删除</el-button>
        </div>
      </div>
    </div>

    <!-- 关联对话框 -->
    <el-dialog v-model="showLinkDialog" title="关联资源" width="480px">
      <el-form label-width="80px">
        <el-form-item label="目标 RID">
          <el-input v-model="linkForm.target" placeholder="输入目标资源 RID" />
        </el-form-item>
        <el-form-item label="关系类型">
          <el-select v-model="linkForm.type" style="width: 100%;">
            <el-option value="reference" label="reference (引用)" />
            <el-option value="related" label="related (相关)" />
            <el-option value="parent" label="parent (父级)" />
            <el-option value="child" label="child (子级)" />
            <el-option value="derived" label="derived (派生)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLinkDialog = false">取消</el-button>
        <el-button type="primary" @click="handleLink">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import api from '@/api'
import type { Resource } from '@/types'

const route = useRoute()
const router = useRouter()
const resource = ref<Resource | any>(null)
const editContent = ref(false)
const editTitle = ref(false)
const addingTag = ref(false)
const newTag = ref('')
const tagInput = ref()
const tags = ref<string[]>([])
const relations = ref<any[]>([])
const showLinkDialog = ref(false)

const form = ref({ title: '', content: '' })
const linkForm = ref({ target: '', type: 'reference' })

onMounted(() => fetchDetail())

async function fetchDetail() {
  const rid = route.params.rid as string
  try {
    const res = await api.getResource(rid)
    const d: any = res.data?.data
    if (d) {
      resource.value = d
      tags.value = d.tags || []
      relations.value = (d.relations && d.relations.outgoing || [])
        .concat(d.relations && d.relations.incoming || [])
      form.value.content = d.content || ''
      form.value.title = d.title || ''
    }
  } catch {}
}

// ---- 标题编辑 ----
function startEditTitle() {
  editTitle.value = true
}

async function saveTitle() {
  editTitle.value = false
  if (form.value.title === (resource.value?.title || '')) return
  try {
    await api.updateResource(resource.value.rid, {
      metadata: { ...(resource.value.metadata || {}), title: form.value.title }
    })
    resource.value.title = form.value.title
    ElMessage.success('标题已更新')
  } catch {}
}

// ---- 内容编辑 ----
async function saveContent() {
  try {
    await api.updateResource(resource.value.rid, { content: form.value.content })
    resource.value.content = form.value.content
    editContent.value = false
    ElMessage.success('内容已保存')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  }
}

// ---- 标签 ----
function startAddTag() {
  addingTag.value = true
  setTimeout(() => tagInput.value?.focus(), 50)
}

async function handleAddTag() {
  if (!newTag.value.trim()) { addingTag.value = false; return }
  const t = newTag.value.trim()
  if (!tags.value.includes(t)) {
    const newTags = [...tags.value, t]
    await api.setTags(resource.value.rid, newTags)
    tags.value = newTags
  }
  newTag.value = ''
  addingTag.value = false
}

async function handleRemoveTag(tag: string) {
  await api.removeTag(resource.value.rid, tag)
  tags.value = tags.value.filter(t => t !== tag)
}

// ---- 关联 ----
async function handleLink() {
  if (!linkForm.value.target) return
  try {
    await api.linkResource(resource.value.rid, linkForm.value.target, linkForm.value.type)
    showLinkDialog.value = false
    linkForm.value.target = ''
    ElMessage.success('关联成功')
    fetchDetail()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '关联失败')
  }
}

async function handleUnlink(rel: any) {
  const target = rel.from === resource.value.rid ? rel.to : rel.from
  try {
    await api.unlinkResource(resource.value.rid, target, rel.type)
    relations.value = relations.value.filter(r => r.id !== rel.id)
    ElMessage.success('已断开')
  } catch {}
}

// ---- 删除 ----
async function handleDelete() {
  try {
    await ElMessageBox.confirm('确定删除该资源？', '确认', {
      confirmButtonText: '软删除',
      cancelButtonText: '取消',
      type: 'warning',
      distinguishCancelAndClose: true,
    })
    await api.deleteResource(resource.value.rid)
    ElMessage.success('已软删除')
    router.push('/resources')
  } catch (e: any) {
    if (e === 'close') return
  }
}
</script>
