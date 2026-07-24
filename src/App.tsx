import { useEffect, useMemo, useState } from 'react'
import type {
  ForecastInput,
  InitialConditions,
  RetirementPlan,
  SavingsPlanSegment,
} from './engine/types'
import { runForecast } from './engine/forecast'
import { InitialConditionsForm } from './components/InitialConditionsForm'
import { SavingsPlanForm, validateSegments } from './components/SavingsPlanForm'
import { RetirementPlanForm } from './components/RetirementPlanForm'
import { GlobalAssumptionsForm } from './components/GlobalAssumptionsForm'
import { ResultsTable } from './components/ResultsTable'
import { SavingsChart } from './components/SavingsChart'
import { ContributionRoomChart } from './components/ContributionRoomChart'
import { SavedPlans, type ActivePlan } from './components/SavedPlans'
import type { SavedPlan } from './utils/storage'
import { formatCurrency } from './utils/format'
import './App.css'

// Sensible defaults so the app shows something immediately on load.
const DEFAULT_INPUT: ForecastInput = {
  initial: {
    currentAge: 35,
    currentRRSP: 50000,
    currentTFSA: 30000,
    currentIncome: 90000,
    retirementAge: 65,
    incomeTaxRate: 0.25,
    currentRRSPRoom: 40000,
  },
  savingsPlan: [
    {
      id: 'seg-initial',
      monthlyRRSP: 500,
      monthlyTFSA: 500,
      refundReinvestFraction: 1,
      untilAge: 65,
    },
  ],
  retirement: {
    requiredMonthlyIncome: 4000,
    cppMonthly: 1000,
    cppStartAge: 65,
    oasMonthly: 700,
    oasStartAge: 65,
    retirementTaxRate: 0.15,
  },
  rateOfReturn: 0.05,
  endAge: 100,
}

// Defends against saved plans from an earlier version of the app that are
// missing fields a newer schema added, so loading one can't hand the engine
// undefined numbers.
function withDefaults(saved: ForecastInput): ForecastInput {
  return {
    ...DEFAULT_INPUT,
    ...saved,
    initial: { ...DEFAULT_INPUT.initial, ...saved.initial },
    retirement: { ...DEFAULT_INPUT.retirement, ...saved.retirement },
  }
}

type Mode = 'plan' | 'results'

function App() {
  const [input, setInput] = useState<ForecastInput>(DEFAULT_INPUT)
  const [mode, setMode] = useState<Mode>('plan')
  const [activePlan, setActivePlan] = useState<ActivePlan | null>(null)

  function patchInitial(patch: Partial<InitialConditions>) {
    setInput((prev) => ({ ...prev, initial: { ...prev.initial, ...patch } }))
  }

  function patchRetirement(patch: Partial<RetirementPlan>) {
    setInput((prev) => ({ ...prev, retirement: { ...prev.retirement, ...patch } }))
  }

  function setSegments(savingsPlan: SavingsPlanSegment[]) {
    setInput((prev) => ({ ...prev, savingsPlan }))
  }

  function loadPlan(saved: SavedPlan) {
    setInput(withDefaults(saved.input))
    setActivePlan({ id: saved.id, name: saved.name })
    setMode('results')
  }

  // Only feed the engine a valid (strictly-increasing) savings plan; otherwise
  // hold the last-known-good render rather than crashing on bad input.
  const segmentErrors = validateSegments(input.savingsPlan)
  const planIsValid = !segmentErrors.some(Boolean)

  const forecast = useMemo(() => {
    if (!planIsValid) return []
    try {
      return runForecast(input)
    } catch {
      return []
    }
  }, [input, planIsValid])

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
    <div className={mode === 'results' ? 'app app-wide' : 'app'}>
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
            currentInput={input}
            canSave={planIsValid}
            activePlan={activePlan}
            onLoad={loadPlan}
            onActivePlanChange={setActivePlan}
          />
          <div className="plan-grid">
            <div className="plan-cell plan-cell-initial">
              <InitialConditionsForm value={input.initial} onChange={patchInitial} />
            </div>
            <div className="plan-cell plan-cell-retirement">
              <RetirementPlanForm value={input.retirement} onChange={patchRetirement} />
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
            rateOfReturn={input.rateOfReturn}
            endAge={input.endAge}
            onRateChange={(rateOfReturn) => setInput((prev) => ({ ...prev, rateOfReturn }))}
            onEndAgeChange={(endAge) => setInput((prev) => ({ ...prev, endAge }))}
          />
          <SavingsChart forecast={forecast} />
          <ContributionRoomChart forecast={forecast} />
          <ResultsTable forecast={forecast} />
        </div>
      )}
    </div>
  )
}

export default App
