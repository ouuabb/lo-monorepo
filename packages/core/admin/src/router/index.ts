import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    {
      path: '/',
      name: 'MainLayout',
      component: () => import('@/layouts/MainLayout.vue'),
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/Dashboard.vue')
        },
        {
          path: 'resources',
          name: 'Resources',
          component: () => import('@/views/Resources.vue')
        },
        {
          path: 'resources/:rid',
          name: 'ResourceDetail',
          component: () => import('@/views/ResourceDetail.vue')
        },
        {
          path: 'graph',
          name: 'Graph',
          component: () => import('@/views/Graph.vue')
        },
        {
          path: 'containers',
          name: 'Containers',
          component: () => import('@/views/Containers.vue')
        },
        {
          path: 'suggestions',
          name: 'Suggestions',
          component: () => import('@/views/Suggestions.vue')
        },
        {
          path: 'metadata',
          name: 'Metadata',
          component: () => import('@/views/Metadata.vue')
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/Settings.vue')
        }
      ]
    }
  ]
})

export default router
