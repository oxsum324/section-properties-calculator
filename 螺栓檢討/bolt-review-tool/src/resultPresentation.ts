import type { CheckResult, ResultValuePresentation, UnitPreferences } from './domain'
import { getUnitSymbol } from './units'

export function getResultPresentation(
  result: Pick<CheckResult, 'presentation'>,
): ResultValuePresentation {
  return result.presentation ?? 'force'
}

export function getResultPresentationLabel(
  result: Pick<CheckResult, 'presentation'>,
) {
  switch (getResultPresentation(result)) {
    case 'length':
      return '長度'
    case 'stress':
      return '應力'
    case 'ratio':
      return '比值'
    case 'force':
    default:
      return '力量'
  }
}

export function getResultPresentationSummary(
  result: Pick<CheckResult, 'presentation'>,
  units: UnitPreferences,
) {
  const presentation = getResultPresentation(result)
  if (presentation === 'ratio') {
    return '比值（無單位）'
  }

  const quantity =
    presentation === 'stress'
      ? 'stress'
      : presentation === 'length'
        ? 'length'
        : 'force'
  return `${getResultPresentationLabel(result)}（${getUnitSymbol(quantity, units)}）`
}
