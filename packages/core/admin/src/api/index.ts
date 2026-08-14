import axios from 'axios'
import type { ApiResponse, Resource, GraphData, Suggestion, Container, ContainerMember, Stats } from '@/types'

const http = axios.create({
  // 后台和 API 由同一进程托管，空 baseURL = 自动同源
  baseURL: '',
  timeout: 30000
})

export const api = {
  // ---- 仪表盘 ----
  getStats() {
    return http.get<ApiResponse<Stats>>('/api/admin/stats')
  },

  // ---- 资源 CRUD ----
  getResources(params?: Record<string, any>) {
    return http.get<ApiResponse<Resource[]>>('/api/admin/resources', { params })
  },

  getResource(rid: string) {
    return http.get<ApiResponse<Resource>>(`/api/admin/resources/${rid}`)
  },

  createResource(data: { name: string; content?: string; metadata?: Record<string, any> }) {
    return http.post<ApiResponse<Resource>>('/api/admin/resources', data)
  },

  importFiles(paths: string[]) {
    return http.post<ApiResponse<{ imported: Resource[]; failed: { path: string; error: string }[] }>>('/api/admin/import', { paths })
  },

  updateResource(rid: string, data: { content?: string; metadata?: Record<string, any>; name?: string }) {
    return http.put<ApiResponse<Resource>>(`/api/admin/resources/${rid}`, data)
  },

  deleteResource(rid: string, hard = false) {
    return http.delete<ApiResponse<null>>(`/api/admin/resources/${rid}`, { params: { hard } })
  },

  // ---- 搜索 ----
  searchResources(q: string) {
    return http.get<ApiResponse<Resource[]>>('/api/admin/search', { params: { q } })
  },

  // ---- 关联 ----
  linkResource(rid: string, target: string, type = 'reference') {
    return http.post<ApiResponse<null>>(`/api/admin/resources/${rid}/link`, { target, type })
  },

  unlinkResource(rid: string, target: string, type = 'reference') {
    return http.delete<ApiResponse<null>>(`/api/admin/resources/${rid}/link/${encodeURIComponent(target)}`, { params: { type } })
  },

  // ---- 标签 ----
  setTags(rid: string, tags: string[]) {
    return http.put<ApiResponse<null>>(`/api/admin/resources/${rid}/tags`, { tags })
  },

  removeTag(rid: string, tag: string) {
    return http.delete<ApiResponse<null>>(`/api/admin/resources/${rid}/tags/${encodeURIComponent(tag)}`)
  },

  // ---- 提交 ----
  commit(message: string) {
    return http.post<ApiResponse<null>>('/api/admin/commit', { message })
  },

  getStatus() {
    return http.get<ApiResponse<any>>('/api/admin/status')
  },

  // ---- 图谱 ----
  getGraph() {
    return http.get<ApiResponse<GraphData>>('/api/admin/graph')
  },

  // ---- 建议 ----
  getSuggestions() {
    return http.get<ApiResponse<Suggestion[]>>('/api/admin/suggestions')
  },

  acceptSuggestion(id: string) {
    return http.post<ApiResponse<null>>(`/api/admin/suggestions/${id}/accept`)
  },

  rejectSuggestion(id: string) {
    return http.post<ApiResponse<null>>(`/api/admin/suggestions/${id}/reject`)
  },

  executeSuggestion(id: string) {
    return http.post<ApiResponse<null>>(`/api/admin/suggestions/${id}/execute`)
  },

  // ---- 容器 ----
  getContainers() {
    return http.get<ApiResponse<Container[]>>('/api/admin/containers')
  },

  getContainerMembers(id: string) {
    return http.get<ApiResponse<ContainerMember[]>>(`/api/admin/containers/${id}`)
  },

  scanContainer(id: string) {
    return http.post<ApiResponse<null>>(`/api/admin/containers/${id}/scan`)
  },

  promoteMember(containerId: string, memberPath: string, type = 'note') {
    return http.post<ApiResponse<null>>(`/api/admin/containers/${containerId}/members/promote`, { memberPath, type })
  },

  demoteMember(containerId: string, memberPath: string) {
    return http.post<ApiResponse<null>>(`/api/admin/containers/${containerId}/members/demote`, { memberPath })
  },

  // ---- 类型管理 ----
  getTypes() {
    return http.get<ApiResponse<{ type: string; count: number }[]>>('/api/admin/types')
  },

  renameType(oldType: string, newType: string) {
    return http.put<ApiResponse<{ oldType: string; newType: string; affected: number }>>(`/api/admin/types/${encodeURIComponent(oldType)}`, { newType })
  },

  // ---- 标签管理 ----
  getTags() {
    return http.get<ApiResponse<{ tag: string; count: number }[]>>('/api/admin/tags')
  },

  renameTag(oldTag: string, newTag: string) {
    return http.put<ApiResponse<{ oldTag: string; newTag: string; affected: number }>>(`/api/admin/tags/${encodeURIComponent(oldTag)}`, { newTag })
  },

  deleteTag(tag: string) {
    return http.delete<ApiResponse<{ tag: string; affected: number }>>(`/api/admin/tags/${encodeURIComponent(tag)}`)
  },

  // ---- 分类管理 ----
  getCategories() {
    return http.get<ApiResponse<{ category: string; count: number }[]>>('/api/admin/categories')
  },

  renameCategory(oldCategory: string, newCategory: string) {
    return http.put<ApiResponse<{ oldCategory: string; newCategory: string; affected: number }>>(`/api/admin/categories/${encodeURIComponent(oldCategory)}`, { newCategory })
  },

  deleteCategory(category: string) {
    return http.delete<ApiResponse<{ category: string; affected: number }>>(`/api/admin/categories/${encodeURIComponent(category)}`)
  }
}

export default api
