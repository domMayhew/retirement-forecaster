import { useState } from 'react'
import type { ForecastInput } from '../engine/types'
import { listSavedPlans, savePlan, deleteSavedPlan, type SavedPlan } from '../utils/storage'

interface Props {
  currentInput: ForecastInput
  /** Whether the current plan is valid and safe to save/load. */
  canSave: boolean
  onLoad: (input: ForecastInput) => void
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

export function SavedPlans({ currentInput, canSave, onLoad }: Props) {
  const [plans, setPlans] = useState<SavedPlan[]>(() => listSavedPlans())
  const [name, setName] = useState('')

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || !canSave) return
    savePlan(trimmed, currentInput)
    setPlans(listSavedPlans())
    setName('')
  }

  function handleDelete(id: string) {
    deleteSavedPlan(id)
    setPlans(listSavedPlans())
  }

  return (
    <section className="card">
      <h2>Saved plans</h2>
      <div className="save-plan-row">
        <input
          type="text"
          className="save-plan-name"
          placeholder="Name this plan…"
          value={name}
          aria-label="Plan name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
        />
        <button
          type="button"
          className="btn-add"
          onClick={handleSave}
          disabled={!name.trim() || !canSave}
          title={!canSave ? 'Fix the savings plan before saving' : undefined}
        >
          Save current plan
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
                <button type="button" className="btn-back" onClick={() => onLoad(plan.input)}>
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
