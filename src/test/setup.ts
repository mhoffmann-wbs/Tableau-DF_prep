import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library can't register its own auto-cleanup.
afterEach(() => cleanup())

// Pages are lazy: the first import of a big one (Learn loads every lesson and the bank)
// can take over a second on a CI runner, past findBy's default 1 s wait.
configure({ asyncUtilTimeout: 5000 })

if (typeof window !== 'undefined') window.scrollTo = () => {}
