// Named plans, saved to the browser's localStorage so a saver can come back
// later and re-load a scenario instead of re-typing every field.
import type { ForecastInput } from '../engine/types'

const STORAGE_KEY = 'retirement-forecaster:saved-plans'
const DEFAULT_PLAN_KEY = 'retirement-forecaster:default-plan-id'

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
  if (getDefaultPlanId() === id) setDefaultPlanId(null)
}

/** Overwrite an existing saved plan's input in place. Returns null if `id` isn't found. */
export function updateSavedPlan(id: string, input: ForecastInput): SavedPlan | null {
  const all = readAll()
  const index = all.findIndex((p) => p.id === id)
  if (index === -1) return null
  const updated: SavedPlan = { ...all[index], input, savedAt: new Date().toISOString() }
  const next = [...all]
  next[index] = updated
  writeAll(next)
  return updated
}

/** The saved plan (if any) that should load automatically when the app starts fresh. */
export function getDefaultPlanId(): string | null {
  try {
    return localStorage.getItem(DEFAULT_PLAN_KEY)
  } catch {
    return null
  }
}

/** Pass null to clear the default (fall back to the app's built-in starter values). */
export function setDefaultPlanId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(DEFAULT_PLAN_KEY)
    else localStorage.setItem(DEFAULT_PLAN_KEY, id)
  } catch {
    // Storage full or unavailable — nothing to fall back to here.
  }
}
