export interface Resource {
  rid: string
  type: string
  title: string
  metadata: Record<string, any>
  created: string
  updated: string
  hash: string
  size: number
}

export interface GraphNode {
  id: string
  label: string
  group?: string
  [key: string]: any
}

export interface GraphEdge {
  from: string
  to: string
  label?: string
  [key: string]: any
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Suggestion {
  id: string
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
  status: 'pending' | 'accepted' | 'rejected'
}

export interface ContainerMember {
  rid: string
  path: string
  status: string
  source: string
}

export interface Container {
  id: string
  name: string
  path: string
  memberCount: number
}

export interface Stats {
  resources: number
  relations: number
  tags: number
  categories: number
  suggestions: number
}

export interface TypeInfo {
  type: string
  count: number
}

export interface ApiResponse<T = any> {
  ok: boolean
  data: T
  error?: string
}
