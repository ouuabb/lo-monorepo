<template>
  <div style="display: flex; height: 100vh;">
    <aside style="width: 220px; background: #1a1a1a; display: flex; flex-direction: column;">
      <div style="padding: 20px 16px; color: #fff; font-size: 18px; font-weight: 600; border-bottom: 1px solid #333;">
        Admin
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#1a1a1a"
        text-color="#ccc"
        active-text-color="#fff"
        style="border-right: none; flex: 1;"
      >
        <el-menu-item index="/dashboard">
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/resources">
          <span>资源管理</span>
        </el-menu-item>
        <el-menu-item index="/graph">
          <span>关系图谱</span>
        </el-menu-item>
        <el-menu-item index="/containers">
          <span>容器管理</span>
        </el-menu-item>
        <el-menu-item index="/suggestions">
          <span>建议中心</span>
        </el-menu-item>
        <el-menu-item index="/metadata">
          <span>元数据管理</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <span>设置</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
      <main style="flex: 1; overflow-y: auto; background: #f5f7fa; padding: 24px;">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const activeMenu = computed(() => route.path)
</script>
