// Named plans, saved to the browser's localStorage so a saver can come back
// later and re-load a scenario instead of re-typing every field.
import type { ForecastInput } from '../engine/types'

const STORAGE_KEY = 'retirement-forecaster:saved-plans'

export interface SavedPlan {
  id: string
  name: string
  savedAt: string // ISO timestamp
  input: ForecastInput
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readAll(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt JSON, or localStorage unavailable (private browsing, etc).
    return []
  }
}

function writeAll(plans: SavedPlan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
  } catch {
    // Storage full or unavailable — the in-memory plan still works either way.
  }
}

/** Most recently saved first. */
export function listSavedPlans(): SavedPlan[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function savePlan(name: string, input: ForecastInput): SavedPlan {
  const plan: SavedPlan = { id: newId(), name, savedAt: new Date().toISOString(), input }
  writeAll([...readAll(), plan])
  return plan
}

export function deleteSavedPlan(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id))
}
