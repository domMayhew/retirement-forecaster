import { useMemo, useState } from 'react'
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

function App() {
  const [input, setInput] = useState<ForecastInput>(DEFAULT_INPUT)

  function patchInitial(patch: Partial<InitialConditions>) {
    setInput((prev) => ({ ...prev, initial: { ...prev.initial, ...patch } }))
  }

  function patchRetirement(patch: Partial<RetirementPlan>) {
    setInput((prev) => ({ ...prev, retirement: { ...prev.retirement, ...patch } }))
  }

  function setSegments(savingsPlan: SavingsPlanSegment[]) {
    setInput((prev) => ({ ...prev, savingsPlan }))
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Retirement Forecaster</h1>
        <p className="tagline">
          Project your RRSP and TFSA balances from today through retirement.
        </p>
      </header>

      <div className="layout">
        <div className="inputs">
          <InitialConditionsForm value={input.initial} onChange={patchInitial} />
          <SavingsPlanForm
            segments={input.savingsPlan}
            retirementAge={input.initial.retirementAge}
            onChange={setSegments}
          />
          <RetirementPlanForm value={input.retirement} onChange={patchRetirement} />
          <GlobalAssumptionsForm
            rateOfReturn={input.rateOfReturn}
            endAge={input.endAge}
            onRateChange={(rateOfReturn) => setInput((prev) => ({ ...prev, rateOfReturn }))}
            onEndAgeChange={(endAge) => setInput((prev) => ({ ...prev, endAge }))}
          />
        </div>

        <div className="outputs">
          {!planIsValid && (
            <p className="notice">
              Fix the savings plan (each row's “until age” must increase) to see
              updated results.
            </p>
          )}
          <SavingsChart forecast={forecast} />
          <ResultsTable forecast={forecast} />
        </div>
      </div>
    </div>
  )
}

export default App
