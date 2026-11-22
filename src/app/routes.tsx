import { lazy } from 'react'
import type { RouteObject } from 'react-router'
import { Layout } from './Layout'

// Every page is code-split, so the shell loads fast and each page (with its
// content and, later, the chart engine) loads on first use. Keep content
// imports out of this file and Layout.
const HomePage = lazy(() => import('../pages/HomePage'))

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <h1 className="text-2xl font-semibold">Page not found</h1> },
    ],
  },
]
