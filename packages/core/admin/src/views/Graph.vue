<template>
  <div style="background: #fff; padding: 24px; border-radius: 8px;">
    <h3 style="margin: 0 0 16px; font-size: 18px;">关系图谱</h3>
    <div ref="graphContainer" style="width: 100%; height: 500px; border: 1px solid #e4e7ed;"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Network } from 'vis-network'
import type { Data } from 'vis-network'
import api from '@/api'

const graphContainer = ref<HTMLElement | null>(null)
let network: Network | null = null

onMounted(async () => {
  const res = await api.getGraph()
  if (!res.data.ok || !graphContainer.value) return

  const { nodes, edges } = res.data.data
  const data: Data = {
    nodes: nodes.map((n) => ({ id: n.id, label: n.label, group: n.group })),
    edges: edges.map((e) => ({ from: e.from, to: e.to, label: e.label }))
  }
  network = new Network(graphContainer.value, data, {
    nodes: { shape: 'dot', size: 16 },
    edges: { arrows: 'to' },
    physics: { solver: 'forceAtlas2Based' }
  })
})

onBeforeUnmount(() => {
  network?.destroy()
})
</script>
