import { useMemo } from 'react'
import type { Scenario, VaultData } from '../lib/types'
import { forecast, type ForecastResult } from '../engine/forecast'
import { buildAdvice, type Advice } from '../engine/advice'

// Прогноз с Монте-Карло стоит десятки миллисекунд — считаем один раз на снимок
// данных и переиспользуем во всех панелях.
let cacheKey: unknown = null
let cacheScenario: string | null = null
let cached: { fc: ForecastResult; advice: Advice[] } | null = null

export function useAnalytics(data: VaultData, scenario: Scenario | null = null) {
  return useMemo(() => {
    const scKey = scenario ? JSON.stringify(scenario) : null
    if (cached && cacheKey === data && cacheScenario === scKey) return cached
    const fc = forecast(data, scenario, data.settings.forecastHorizon, data.settings.monteCarloRuns)
    const advice = buildAdvice(data, fc)
    cached = { fc, advice }
    cacheKey = data
    cacheScenario = scKey
    return cached
  }, [data, scenario])
}

/** Прогноз без советов — для сценарных ползунков, где важна только линия. */
export function useForecastOnly(data: VaultData, scenario: Scenario | null, runs?: number) {
  return useMemo(
    () => forecast(data, scenario, data.settings.forecastHorizon, runs ?? data.settings.monteCarloRuns),
    [data, scenario, runs],
  )
}
