import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { оповестить } from './Opoveshchenie'
import { freshAwards } from '../engine/honors'
import { today } from '../lib/date'
import { т } from '../i18n'

/*
 * Пожалованіе наградъ.
 *
 * Условія наградъ пересчитываются изъ данныхъ всегда — потому награда не
 * можетъ «застрять» отъ прошлой жизни хранилища. А вотъ день, когда она
 * сошлась впервые, изъ данныхъ не выводится: его и записываемъ.
 *
 * Отсюда же защита отъ круга: разъ дата записана, freshAwards такую награду
 * больше не вернётъ, и запись въ хранилище не запускаетъ сама себя.
 *
 * Въ первый пересчётъ молчимъ. Человѣкъ, открывшій программу съ уже
 * накопленнымъ хранилищемъ, получилъ бы дюжину всплывашекъ подрядъ и
 * возненавидѣлъ бы ихъ прежде, чѣмъ разобрался, за что онѣ. Даты при этомъ
 * проставляются — просто тихо.
 */
export function HonorsHost() {
  const { data, ready, patchHonors } = useStore()
  const первыйРазъ = useRef(true)

  useEffect(() => {
    if (!ready) return
    const свѣжія = freshAwards(data)
    if (!свѣжія.length) {
      первыйРазъ.current = false
      return
    }

    const день = today()
    const стало = { ...(data.honors?.awarded ?? {}) }
    for (const a of свѣжія) стало[a.id] = день
    patchHonors({ awarded: стало })

    if (первыйРазъ.current) {
      первыйРазъ.current = false
      return
    }
    // Награда — окно посередине, а не подсказка в углу: её прежде не замечали.
    свѣжія.slice(0, 3).forEach((a, i) =>
      оповестить({ title: a.title, body: a.about, вид: 'award', ...(i === 0 ? { звук: 'award' as const } : {}) }),
    )
  }, [data, ready, patchHonors])

  return null
}
