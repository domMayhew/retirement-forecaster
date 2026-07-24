import { useEffect, useMemo, useState } from 'react'
import type {
  ContributionOverride,
  ForecastInput,
  InitialConditions,
  RetirementPlan,
  SavingsPlanSegment,
  WithdrawalOverride,
} from './engine/types'
import { runForecast } from './engine/forecast'
import { InitialConditionsForm } from './components/InitialConditionsForm'
import { SavingsPlanForm, validateSegments } from './components/SavingsPlanForm'
import { RetirementPlanForm } from './components/RetirementPlanForm'
import { GlobalAssumptionsForm } from './components/GlobalAssumptionsForm'
import { ResultsTable } from './components/ResultsTable'
import { ResultsSummary } from './components/ResultsSummary'
import { SavingsChart } from './components/SavingsChart'
import { ContributionRoomChart } from './components/ContributionRoomChart'
import { SavedPlans, type ActivePlan } from './components/SavedPlans'
import { PlanComparison } from './components/PlanComparison'
import { getDefaultPlanId, getSettings, listSavedPlans, updateSettings, type SavedPlan } from './utils/storage'
import { formatCurrency } from './utils/format'
import { DEFAULT_INPUT, withDefaults } from './defaultInput'
import './App.css'

type Mode = 'plan' | 'results' | 'compare'

// If a saved plan has been marked as the default, load it instead of the
// built-in starter values — that's the whole point of marking one.
function getStartupState(): { input: ForecastInput; activePlan: ActivePlan | null } {
  const defaultId = getDefaultPlanId()
  const defaultPlan = defaultId ? listSavedPlans().find((p) => p.id === defaultId) : undefined
  if (!defaultPlan) return { input: DEFAULT_INPUT, activePlan: null }
  return {
    input: withDefaults(defaultPlan.input),
    activePlan: { id: defaultPlan.id, name: defaultPlan.name },
  }
}

function App() {
  const [input, setInput] = useState<ForecastInput>(() => getStartupState().input)
  const [mode, setMode] = useState<Mode>('plan')
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(() => getStartupState().activePlan)
  const [comparePlans, setComparePlans] = useState<SavedPlan[]>([])
  // The assumed rate of return is a global setting, not part of any one
  // plan: it persists across reloads and stays put across loading a
  // different plan, instead of getting overwritten by whatever rate that
  // plan happened to be saved with.
  const [rateOfReturn, setRateOfReturn] = useState<number>(
    () => getSettings().rateOfReturn ?? DEFAULT_INPUT.rateOfReturn,
  )

  function changeRateOfReturn(rate: number) {
    setRateOfReturn(rate)
    updateSettings({ rateOfReturn: rate })
  }

  function patchInitial(patch: Partial<InitialConditions>) {
    setInput((prev) => ({ ...prev, initial: { ...prev.initial, ...patch } }))
  }

  function patchRetirement(patch: Partial<RetirementPlan>) {
    setInput((prev) => ({ ...prev, retirement: { ...prev.retirement, ...patch } }))
  }

  function setSegments(savingsPlan: SavingsPlanSegment[]) {
    setInput((prev) => ({ ...prev, savingsPlan }))
  }

  function setContributionOverride(
    age: number,
    field: keyof ContributionOverride,
    value: number,
  ) {
    setInput((prev) => ({
      ...prev,
      contributionOverrides: {
        ...prev.contributionOverrides,
        [age]: { ...prev.contributionOverrides[age], [field]: value },
      },
    }))
  }

  function setWithdrawalOverride(
    age: number,
    field: keyof WithdrawalOverride,
    value: number,
  ) {
    setInput((prev) => ({
      ...prev,
      withdrawalOverrides: {
        ...prev.withdrawalOverrides,
        [age]: { ...prev.withdrawalOverrides[age], [field]: value },
      },
    }))
  }

  function recalculateFromInputs() {
    setInput((prev) => ({ ...prev, contributionOverrides: {}, withdrawalOverrides: {} }))
  }

  function loadPlan(saved: SavedPlan) {
    setInput(withDefaults(saved.input))
    setActivePlan({ id: saved.id, name: saved.name })
    setMode('results')
  }

  function comparePlansHandler(plans: SavedPlan[]) {
    setComparePlans(plans)
    setMode('compare')
  }

  // The full engine input: everything the saver edits, plus the globally
  // assumed rate of return layered on top (never the other way around).
  const effectiveInput = useMemo(() => ({ ...input, rateOfReturn }), [input, rateOfReturn])

  // Only feed the engine a valid (strictly-increasing) savings plan; otherwise
  // hold the last-known-good render rather than crashing on bad input.
  const segmentErrors = validateSegments(input.savingsPlan)
  const planIsValid = !segmentErrors.some(Boolean)

  const forecast = useMemo(() => {
    if (!planIsValid) return []
    try {
      return runForecast(effectiveInput)
    } catch {
      return []
    }
  }, [effectiveInput, planIsValid])

  // The first age (if any) where the plan contributes more RRSP than the
  // saver has room for.
  const roomExceededYear = forecast.find((r) => r.rrspRoom < 0)
  const hasWarning = Boolean(roomExceededYear) || forecast.some((r) => r.shortfall)
  const lastYear = forecast[forecast.length - 1]

  // Results depends on a valid plan; if editing breaks the plan while the
  // saver is looking at results, drop them back to Plan so they see why.
  useEffect(() => {
    if (!planIsValid) setMode('plan')
  }, [planIsValid])

  return (
    <div className={mode === 'results' || mode === 'compare' ? 'app app-wide' : 'app'}>
      <header className="app-header">
        <div className="app-header-top">
          <div>
            <h1>Retirement Forecaster</h1>
            <p className="tagline">
              Project your RRSP and TFSA balances from today through retirement.
            </p>
          </div>
          <nav className="mode-tabs" aria-label="View">
            <button
              type="button"
              className={mode === 'plan' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setMode('plan')}
            >
              1. Plan
            </button>
            <button
              type="button"
              className={mode === 'results' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setMode('results')}
              disabled={!planIsValid}
              title={!planIsValid ? 'Fix the savings plan to see results' : undefined}
            >
              2. Results
              {hasWarning && <span className="tab-warning-dot" aria-label="Has warnings" />}
            </button>
          </nav>
        </div>
      </header>

      {mode === 'plan' ? (
        <div className="plan-view">
          {!planIsValid && (
            <p className="notice">
              Fix the savings plan (each row's “until age” must increase) to see
              updated results.
            </p>
          )}
          <SavedPlans
            currentInput={effectiveInput}
            canSave={planIsValid}
            activePlan={activePlan}
            onLoad={loadPlan}
            onActivePlanChange={setActivePlan}
            onCompare={comparePlansHandler}
          />
          <div className="plan-grid">
            <div className="plan-cell plan-cell-initial">
              <InitialConditionsForm value={input.initial} onChange={patchInitial} />
            </div>
            <div className="plan-cell plan-cell-retirement">
              <RetirementPlanForm
                value={input.retirement}
                onChange={patchRetirement}
                reinvestForcedWithdrawals={input.reinvestForcedWithdrawals}
                onReinvestForcedWithdrawalsChange={(reinvestForcedWithdrawals) =>
                  setInput((prev) => ({ ...prev, reinvestForcedWithdrawals }))
                }
              />
            </div>
            <div className="plan-cell plan-cell-savings">
              <SavingsPlanForm
                segments={input.savingsPlan}
                retirementAge={input.initial.retirementAge}
                onChange={setSegments}
              />
            </div>
          </div>

          <div className="plan-cta">
            <div className="plan-cta-summary">
              {planIsValid && lastYear ? (
                <>
                  Projected total at age {lastYear.age}:{' '}
                  <strong>{formatCurrency(lastYear.total)}</strong>
                </>
              ) : (
                'Fix the savings plan above to see a projection.'
              )}
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={!planIsValid}
              onClick={() => setMode('results')}
            >
              View results →
            </button>
          </div>
        </div>
      ) : mode === 'compare' ? (
        <div className="results-view">
          <button type="button" className="btn-back" onClick={() => setMode('plan')}>
            ← Edit inputs
          </button>
          <PlanComparison
            plans={comparePlans}
            rateOfReturn={rateOfReturn}
            onRateChange={changeRateOfReturn}
          />
        </div>
      ) : (
        <div className="results-view">
          <button type="button" className="btn-back" onClick={() => setMode('plan')}>
            ← Edit inputs
          </button>

          {roomExceededYear && (
            <p className="notice">
              At age {roomExceededYear.age} the plan over-contributes to the
              RRSP: contribution room goes {formatCurrency(roomExceededYear.rrspRoom)}
              . Lower the RRSP contribution or raise the starting contribution
              room.
            </p>
          )}

          <GlobalAssumptionsForm
            rateOfReturn={rateOfReturn}
            endAge={input.endAge}
            onRateChange={changeRateOfReturn}
            onEndAgeChange={(endAge) => setInput((prev) => ({ ...prev, endAge }))}
          />
          <ResultsSummary forecast={forecast} input={effectiveInput} />
          <SavingsChart forecast={forecast} />
          <ContributionRoomChart forecast={forecast} />
          <ResultsTable
            forecast={forecast}
            contributionOverrides={input.contributionOverrides}
            onContributionOverride={setContributionOverride}
            withdrawalOverrides={input.withdrawalOverrides}
            onWithdrawalOverride={setWithdrawalOverride}
            onRecalculate={recalculateFromInputs}
          />
        </div>
      )}
    </div>
  )
}

export default App
