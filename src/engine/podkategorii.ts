/*
 * Главные категории и подкатегории.
 *
 * Уровень один: категория либо главная, либо подкатегория главной того же
 * вида. У подкатегории своих подкатегорий не бывает, а главная, у которой
 * они есть, сама подкатегорией стать не может. В саму главную можно
 * записывать траты, как раньше: при раскрытии они идут строкой «без
 * подкатегории».
 *
 * Отчёты складывают подкатегории в главную — «Рабочие расходы» показывают
 * всё, что на работу, а щелчок раскрывает, из чего сумма.
 */
import type { Category, Money, Transaction, VaultData } from '../lib/types'
import type { CatTotal } from './stats'

/** Родитель, если он есть, настоящий и главный. Иначе — нет родителя. */
export function родитель(cat: Category, cats: Category[]): Category | undefined {
  if (!cat.parentId || cat.parentId === cat.id) return undefined
  const р = cats.find((c) => c.id === cat.parentId)
  if (!р || р.parentId || р.kind !== cat.kind) return undefined
  return р
}

/** Id главной категории для этой (сама она, если главная). */
export function главнаяId(id: string, cats: Category[]): string {
  const c = cats.find((x) => x.id === id)
  if (!c) return id
  return родитель(c, cats)?.id ?? id
}

/** Подкатегории главной (без архивных, если не просили). */
export function подкатегории(id: string, cats: Category[], сАрхивом = false): Category[] {
  return cats.filter((c) => c.parentId === id && c.id !== id && (сАрхивом || !c.archived) && родитель(c, cats)?.id === id)
}

/** Главная и все её подкатегории — для фильтров «по категории». */
export function семья(id: string, cats: Category[]): Set<string> {
  return new Set([id, ...подкатегории(id, cats, true).map((c) => c.id)])
}

export const этоГлавная = (cat: Category, cats: Category[]): boolean => !родитель(cat, cats)

/**
 * Можно ли сделать категорию подкатегорией этой главной. Пустая строка —
 * можно; иначе — служебный код причины (на экран не идёт).
 */
export function нельзяВложить(cat: Category, parentId: string, cats: Category[]): string {
  if (!parentId) return ''
  if (parentId === cat.id) return 'self'
  const р = cats.find((c) => c.id === parentId)
  if (!р) return 'no-parent'
  if (р.parentId) return 'parent-is-sub'
  if (р.kind !== cat.kind) return 'other-kind'
  if (cats.some((c) => c.parentId === cat.id && c.id !== cat.id)) return 'has-subs'
  return ''
}

/** Главные категории, в которые можно вложить эту. */
export function возможныеРодители(cat: Category, cats: Category[]): Category[] {
  return cats.filter((c) => !c.archived && c.id !== cat.id && !нельзяВложить(cat, c.id, cats))
}

/** Итоги по категориям, сложенные в главные. */
export function поГлавным(итоги: CatTotal[], cats: Category[]): CatTotal[] {
  const м = new Map<string, { amount: Money; count: number }>()
  for (const t of итоги) {
    const id = главнаяId(t.categoryId, cats)
    const было = м.get(id) ?? { amount: 0, count: 0 }
    м.set(id, { amount: было.amount + t.amount, count: было.count + t.count })
  }
  const всего = [...м.values()].reduce((s, x) => s + x.amount, 0)
  return [...м.entries()]
    .map(([categoryId, x]) => ({ categoryId, amount: x.amount, count: x.count, share: всего ? x.amount / всего : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Раскладка главной: её подкатегории и строка «без подкатегории» — траты,
 * записанные прямо в главную. Id этой строки совпадает с id главной.
 */
export function раскладкаГлавной(итоги: CatTotal[], главная: string, cats: Category[]): CatTotal[] {
  const свои = семья(главная, cats)
  const строки = итоги.filter((t) => свои.has(t.categoryId))
  const всего = строки.reduce((s, x) => s + x.amount, 0)
  return строки
    .map((t) => ({ ...t, share: всего ? t.amount / всего : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Потрачено семьёй: для главной — вместе с подкатегориями, для прочих —
 * своё. Так лимит главной покрывает и её подкатегории.
 */
export function суммаСемьи(id: string, итоги: Map<string, Money>, cats: Category[]): Money {
  let сумма = 0
  for (const x of семья(id, cats)) сумма += итоги.get(x) ?? 0
  return сумма
}

/** Операция относится к семье категории: сама, её доля или подкатегория. */
export function вСемье(t: Transaction, свои: Set<string>): boolean {
  return (!!t.categoryId && свои.has(t.categoryId)) || !!t.splits?.some((s) => свои.has(s.categoryId))
}

/**
 * Удаление главной: её подкатегории становятся главными, а не висят на
 * несуществующем родителе.
 */
export function безРодителя(data: VaultData, удалённая: string): Category[] {
  return data.categories
    .filter((c) => c.id !== удалённая)
    .map((c) => (c.parentId === удалённая ? { ...c, parentId: undefined } : c))
}

/**
 * Список для выбора: главные по порядку, под каждой — её подкатегории.
 * Поиск ищет и по имени главной: «работ» найдёт и «Таню Челябу» внутри
 * «Рабочих расходов».
 */
export function деревоКатегорий(cats: Category[], поиск = ''): { cat: Category; главная?: Category }[] {
  const нить = поиск.trim().toLowerCase()
  const годится = (c: Category, р?: Category) =>
    !нить || c.name.toLowerCase().includes(нить) || (!!р && р.name.toLowerCase().includes(нить))
  const итогъ: { cat: Category; главная?: Category }[] = []
  const главные = cats.filter((c) => этоГлавная(c, cats))
  for (const г of главные) {
    const дети = cats.filter((c) => родитель(c, cats)?.id === г.id)
    const подошли = дети.filter((д) => годится(д, г))
    if (годится(г) || подошли.length) итогъ.push({ cat: г })
    for (const д of подошли) итогъ.push({ cat: д, главная: г })
  }
  return итогъ
}
