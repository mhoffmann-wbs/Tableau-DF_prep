import { lazy } from 'react'
import type { RouteObject } from 'react-router'
import { Layout } from './Layout'

// Every page is code-split, so the shell loads fast and each page (with its
// content and, later, the chart engine) loads on first use. Keep content
// imports out of this file and Layout.
const HomePage = lazy(() => import('../pages/HomePage'))
const LearnPage = lazy(() => import('../pages/LearnPage'))
const PracticePage = lazy(() => import('../pages/PracticePage'))
const QuestionsPage = lazy(() => import('../pages/QuestionsPage'))
const MockExamPage = lazy(() => import('../pages/MockExamPage'))
const ProgressPage = lazy(() => import('../pages/ProgressPage'))
const BuildPage = lazy(() => import('../pages/BuildPage'))
const SandboxPage = lazy(() => import('../pages/SandboxPage'))
const CalcPage = lazy(() => import('../pages/CalcPage'))
const FlashcardsPage = lazy(() => import('../pages/FlashcardsPage'))
const SimPage = lazy(() => import('../pages/SimPage'))
const GuidesPage = lazy(() => import('../pages/GuidesPage'))
const ChartGalleryPage = lazy(() => import('../pages/ChartGalleryPage'))

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'learn', element: <LearnPage /> },
      { path: 'learn/:taskId', element: <LearnPage /> },
      { path: 'practice', element: <PracticePage /> },
      { path: 'questions', element: <QuestionsPage /> },
      { path: 'questions/:itemId', element: <QuestionsPage /> },
      { path: 'mock', element: <MockExamPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'build', element: <BuildPage /> },
      { path: 'build/sandbox', element: <SandboxPage /> },
      { path: 'build/sandbox/:challengeId', element: <SandboxPage /> },
      { path: 'build/calc', element: <CalcPage /> },
      { path: 'build/calc/:exerciseId', element: <CalcPage /> },
      { path: 'build/sim/:simId', element: <SimPage /> },
      { path: 'build/flashcards', element: <FlashcardsPage /> },
      { path: 'build/flashcards/deck/:deckId', element: <FlashcardsPage /> },
      { path: 'guides', element: <GuidesPage /> },
      { path: 'guides/:guideId', element: <GuidesPage /> },
      { path: 'dev/charts', element: <ChartGalleryPage /> },
      { path: '*', element: <h1 className="text-2xl font-semibold">Page not found</h1> },
    ],
  },
]
