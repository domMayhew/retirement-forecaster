import { useState } from 'react'
import type { ForecastInput } from '../engine/types'
import {
  listSavedPlans,
  savePlan,
  deleteSavedPlan,
  updateSavedPlan,
  type SavedPlan,
} from '../utils/storage'

/** The saved plan currently loaded into the editor, if any. */
export interface ActivePlan {
  id: string
  name: string
}

interface Props {
  currentInput: ForecastInput
  /** Whether the current plan is valid and safe to save/load. */
  canSave: boolean
  activePlan: ActivePlan | null
  onLoad: (plan: SavedPlan) => void
  onActivePlanChange: (plan: ActivePlan | null) => void
}

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function SavedPlans({ currentInput, canSave, activePlan, onLoad, onActivePlanChange }: Props) {
  const [plans, setPlans] = useState<SavedPlan[]>(() => listSavedPlans())
  const [name, setName] = useState('')

  function handleSaveAsNew() {
    const trimmed = name.trim()
    if (!trimmed || !canSave) return
    const saved = savePlan(trimmed, currentInput)
    setPlans(listSavedPlans())
    setName('')
    onActivePlanChange({ id: saved.id, name: saved.name })
  }

  function handleUpdate() {
    if (!activePlan || !canSave) return
    const updated = updateSavedPlan(activePlan.id, currentInput)
    setPlans(listSavedPlans())
    if (updated) onActivePlanChange({ id: updated.id, name: updated.name })
  }

  function handleDelete(id: string) {
    deleteSavedPlan(id)
    setPlans(listSavedPlans())
    if (activePlan?.id === id) onActivePlanChange(null)
  }

  return (
    <section className="card">
      <h2>Saved plans</h2>

      {activePlan && (
        <div className="active-plan-banner">
          <span>
            Editing <strong>{activePlan.name}</strong>
          </span>
          <button
            type="button"
            className="btn-back"
            onClick={handleUpdate}
            disabled={!canSave}
            title={!canSave ? 'Fix the savings plan before saving' : undefined}
          >
            Update "{activePlan.name}"
          </button>
        </div>
      )}

      <div className="save-plan-row">
        <input
          type="text"
          className="save-plan-name"
          placeholder="Name this plan…"
          value={name}
          aria-label="Plan name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveAsNew()
          }}
        />
        <button
          type="button"
          className="btn-add"
          onClick={handleSaveAsNew}
          disabled={!name.trim() || !canSave}
          title={!canSave ? 'Fix the savings plan before saving' : undefined}
        >
          {activePlan ? 'Save as new plan' : 'Save current plan'}
        </button>
      </div>

      {plans.length === 0 ? (
        <p className="empty">No saved plans yet.</p>
      ) : (
        <ul className="saved-plan-list">
          {plans.map((plan) => (
            <li key={plan.id} className="saved-plan-row">
              <div className="saved-plan-info">
                <span className="saved-plan-name">{plan.name}</span>
                <span className="saved-plan-date">Saved {formatSavedAt(plan.savedAt)}</span>
              </div>
              <div className="saved-plan-actions">
                <button type="button" className="btn-back" onClick={() => onLoad(plan)}>
                  Load
                </button>
                <button
                  type="button"
                  className="btn-remove"
                  aria-label={`Delete "${plan.name}"`}
                  onClick={() => handleDelete(plan.id)}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
