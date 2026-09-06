import React, { useCallback, useEffect, useState } from 'react'
import { вывестиКлючи, type Ключи } from '../lib/crypto'
import { паролеВѣрный } from '../state/cloud'
import { облачныйМостъ } from '../state/cloudbridge'
import { облакоЕсть } from '../state/cloudconfig'
import {
  войти, завести, занятьПриглашеніе, обновить, сеансъСвѣжъ, выйти as выйтиСъСервера,
  type Сеансъ,
} from '../state/supabase'
import { isDesktop, поставитьМостъ } from '../state/vault'

/*
 * Ворота: вход в облако перед тем, как откроется хранилище.
 *
 * Стоят прежде всего остального нарочно. Хранилище начинает грузиться сразу
 * при открытии программы, и мост под ним обязан быть выбран до того — иначе
 * половина данных ушла бы в браузер, а половина в сеть.
 *
 * Показываются только в браузере и только когда облако настроено. Человѣку,
 * поставившему программу себе на диск, никакого входа не предлагается: у него
 * данные и так свои, в своей папке.
 *
 * Ключ нигде не сохраняется. Поэтому при возвращении спрашивается один пароль
 * — без почты, как отпирают ящик. Хранить ключ рядом с данными значило бы
 * отдать и то и другое всякому, кто получит устройство.
 */

const ГДѢ_СЕАНСЪ = 'kashel:облако:сеансъ'
const ГДѢ_ОТКАЗЪ = 'kashel:облако:безъВхода'

type Видъ =
  | { в: 'ждёмъ' }
  | { в: 'выборъ' }
  | { в: 'входъ' }
  | { в: 'заводимъ' }
  | { в: 'отпираемъ'; почта: string }
  | { в: 'готово' }

const прочестьСеансъ = (): Сеансъ | null => {
  try {
    const с = localStorage.getItem(ГДѢ_СЕАНСЪ)
    return с ? (JSON.parse(с) as Сеансъ) : null
  } catch {
    return null
  }
}

const запомнить = (с: Сеансъ | null) => {
  try {
    if (с) localStorage.setItem(ГДѢ_СЕАНСЪ, JSON.stringify(с))
    else localStorage.removeItem(ГДѢ_СЕАНСЪ)
  } catch {
    // Приватное окно запрещает запись. Войти всё равно можно, просто
    // спросим заново при следующем открытии.
  }
}

/** Выйти совсем: сеанс забыт, окно перезагружается на чистый браузерный мост. */
export async function выйтиИзъОблака(): Promise<void> {
  const с = прочестьСеансъ()
  if (с) await выйтиСъСервера(с)
  запомнить(null)
  try { localStorage.removeItem(ГДѢ_ОТКАЗЪ) } catch { /* см. выше */ }
  location.reload()
}

export function Vhod({ children }: { children: React.ReactNode }) {
  const [видъ, setВидъ] = useState<Видъ>({ в: 'ждёмъ' })

  useEffect(() => {
    // Настольной программе и ненастроенному облаку ворота не нужны вовсе.
    if (isDesktop || !облакоЕсть()) return setВидъ({ в: 'готово' })
    if (localStorage.getItem(ГДѢ_ОТКАЗЪ)) return setВидъ({ в: 'готово' })
    const с = прочестьСеансъ()
    setВидъ(с ? { в: 'отпираемъ', почта: с.почта } : { в: 'выборъ' })
  }, [])

  /*
   * Пускать только с верным паролем.
   *
   * Проверка обязательна, и вот почему: ярлыки имён выводятся из пароля, так
   * что с чужим паролем записи попросту не находятся — сервер отвечает «нет
   * такого», и ошибке взяться неоткуда. Человѣкъ увидел бы пустое хранилище и
   * завёл всё заново поверх своих же данных. Проверено вживую: без этой
   * проверки так и происходило.
   */
  const впустить = useCallback(async (с: Сеансъ, ключи: Ключи) => {
    if (!(await паролеВѣрный(с, ключи))) {
      throw new Error('Не тот пароль: записи этой почты им не открываются')
    }
    поставитьМостъ(облачныйМостъ(с, ключи))
    запомнить(с)
    setВидъ({ в: 'готово' })
  }, [])

  if (видъ.в === 'ждёмъ') return null
  if (видъ.в === 'готово') return <>{children}</>

  return (
    <div className="vorota">
      <div className="vorota-karta">
        <div className="vorota-glava">
          <h1>Кошель</h1>
          <p className="faint">Учёт денег, который никуда о вас не сообщает</p>
        </div>

        {видъ.в === 'выборъ' && (
          <Выборъ
            входъ={() => setВидъ({ в: 'входъ' })}
            заводимъ={() => setВидъ({ в: 'заводимъ' })}
            безъВхода={() => {
              try { localStorage.setItem(ГДѢ_ОТКАЗЪ, '1') } catch { /* приватное окно */ }
              setВидъ({ в: 'готово' })
            }}
          />
        )}

        {видъ.в === 'входъ' && (
          <Форма
            видъ="входъ"
            назадъ={() => setВидъ({ в: 'выборъ' })}
            впустить={впустить}
          />
        )}

        {видъ.в === 'заводимъ' && (
          <Форма
            видъ="заводимъ"
            назадъ={() => setВидъ({ в: 'выборъ' })}
            впустить={впустить}
          />
        )}

        {видъ.в === 'отпираемъ' && (
          <Отпираніе
            почта={видъ.почта}
            впустить={впустить}
            другой={() => { запомнить(null); setВидъ({ в: 'выборъ' }) }}
          />
        )}
      </div>
    </div>
  )
}

function Выборъ({ входъ, заводимъ, безъВхода }: {
  входъ: () => void
  заводимъ: () => void
  безъВхода: () => void
}) {
  return (
    <>
      <p className="vorota-рѣчь">
        Войдите, чтобы ваши записи открывались на любом устройстве. Или начните
        без входа — тогда всё останется в этом браузере и пропадёт вместе с его
        историей.
      </p>
      <div className="vorota-кнопки">
        <button className="btn primary" onClick={входъ}>Войти</button>
        <button className="btn" onClick={заводимъ}>Завести запись</button>
      </div>
      <button className="btn ghost sm vorota-мимо" onClick={безъВхода}>
        Продолжить без входа
      </button>
    </>
  )
}

function Форма({ видъ, назадъ, впустить }: {
  видъ: 'входъ' | 'заводимъ'
  назадъ: () => void
  впустить: (с: Сеансъ, к: Ключи) => Promise<void>
}) {
  const [почта, setПочта] = useState('')
  const [пароль, setПароль] = useState('')
  const [кодъ, setКодъ] = useState('')
  const [бѣда, setБѣда] = useState('')
  const [идёмъ, setИдёмъ] = useState(false)
  const заводимъ = видъ === 'заводимъ'

  const пустить = async () => {
    setБѣда('')
    if (!почта.trim() || !пароль) return setБѣда('Заполните почту и пароль')
    if (заводимъ && пароль.length < 10) {
      return setБѣда('Пароль короче десяти знаков. Восстановить его будет нечем — возьмите длиннее')
    }
    if (заводимъ && !кодъ.trim()) return setБѣда('Нужен код приглашения')

    setИдёмъ(true)
    try {
      const ключи = await вывестиКлючи(пароль, почта)
      if (заводимъ) {
        const с = await завести(почта.trim(), ключи.пароль)
        if (!с) {
          setБѣда('Запись создана. Подтвердите почту письмом и войдите.')
          setИдёмъ(false)
          return
        }
        if (!(await занятьПриглашеніе(с, кодъ))) {
          setБѣда('Код не подошёл: его нет или он уже занят')
          setИдёмъ(false)
          return
        }
        await впустить(с, ключи)
      } else {
        await впустить(await войти(почта.trim(), ключи.пароль), ключи)
      }
    } catch (e) {
      setБѣда((e as Error).message)
      setИдёмъ(false)
    }
  }

  return (
    <>
      <label className="vorota-поле">
        <span>Почта</span>
        <input type="email" autoFocus value={почта} disabled={идёмъ}
          onChange={(e) => setПочта(e.target.value)} />
      </label>
      <label className="vorota-поле">
        <span>Пароль</span>
        <input type="password" value={пароль} disabled={идёмъ}
          onChange={(e) => setПароль(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void пустить() }} />
      </label>
      {заводимъ && (
        <label className="vorota-поле">
          <span>Код приглашения</span>
          <input type="text" value={кодъ} disabled={идёмъ} placeholder="XXXXX-XXXXX"
            onChange={(e) => setКодъ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void пустить() }} />
        </label>
      )}

      {заводимъ && (
        <div className="vorota-остереженіе">
          <b>Пароль восстановить нельзя.</b> Ваши записи шифруются им прямо
          здесь, и ключа нет ни у кого, кроме вас, — ни у сервера, ни у автора
          программы. Забудете пароль — данные пропадут навсегда. Это плата за
          то, что чужие деньги никто не прочтёт.
        </div>
      )}

      {бѣда && <div className="vorota-бѣда">{бѣда}</div>}

      <div className="vorota-кнопки">
        <button className="btn primary" onClick={() => void пустить()} disabled={идёмъ}>
          {идёмъ ? 'Открываю…' : заводимъ ? 'Завести' : 'Войти'}
        </button>
        <button className="btn ghost" onClick={назадъ} disabled={идёмъ}>Назад</button>
      </div>
    </>
  )
}

function Отпираніе({ почта, впустить, другой }: {
  почта: string
  впустить: (с: Сеансъ, к: Ключи) => Promise<void>
  другой: () => void
}) {
  const [пароль, setПароль] = useState('')
  const [бѣда, setБѣда] = useState('')
  const [идёмъ, setИдёмъ] = useState(false)

  const отпереть = async () => {
    setБѣда('')
    if (!пароль) return setБѣда('Введите пароль')
    setИдёмъ(true)
    try {
      const ключи = await вывестиКлючи(пароль, почта)
      let с = прочестьСеансъ()!
      // Токен живёт час; после ночи он протух, и его надо обновить, а не
      // гнать человѣка вводить почту заново.
      if (!сеансъСвѣжъ(с)) с = await обновить(с)
      await впустить(с, ключи)
    } catch (e) {
      setБѣда((e as Error).message)
      setИдёмъ(false)
    }
  }

  return (
    <>
      <p className="vorota-рѣчь">
        Вы вошли как <b>{почта}</b>. Введите пароль, чтобы открыть записи —
        ключ на устройстве не хранится.
      </p>
      <label className="vorota-поле">
        <span>Пароль</span>
        <input type="password" autoFocus value={пароль} disabled={идёмъ}
          onChange={(e) => setПароль(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void отпереть() }} />
      </label>
      {бѣда && <div className="vorota-бѣда">{бѣда}</div>}
      <div className="vorota-кнопки">
        <button className="btn primary" onClick={() => void отпереть()} disabled={идёмъ}>
          {идёмъ ? 'Открываю…' : 'Открыть'}
        </button>
        <button className="btn ghost" onClick={другой} disabled={идёмъ}>Другая запись</button>
      </div>
    </>
  )
}
