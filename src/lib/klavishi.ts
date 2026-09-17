/*
 * Горячие клавиши при любой раскладке.
 *
 * e.key — это буква на текущей раскладке: на русской Ctrl+C приходит как
 * «с», и проверка `=== 'c'` молча не срабатывала. Физическая клавиша (e.code)
 * от раскладки не зависит, поэтому буква берётся из неё, а e.key — только
 * если code нет (редкие среды и экранные клавиатуры).
 */
export function буква(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase()
  return (e.key || '').toLowerCase()
}
