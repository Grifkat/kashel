import { useStore } from '../state/store'
import { useToast } from './ui'
import type { Transaction } from '../lib/types'
import {
  вернутьЗапись, вернутьКатегорию, вернутьСчёт, вернутьТег,
  снимокЗаписи, снимокКатегории, снимокСчёта, снимокТега,
} from '../engine/otmena'
import { т } from '../i18n'

/** Сколько держится кнопка «Отменить». */
export const ОТМЕНА_МС = 10_000

/**
 * Удаление с кнопкой «Отменить» в уведомлении. Одно на всю программу:
 * каждое место, где что-то удаляют, зовёт отсюда, и отмена везде
 * одинаковая — точечная, см. engine/otmena.
 */
export function useУдаление() {
  const store = useStore()
  const toast = useToast()

  const сОтменой = (текст: string, вернуть: () => void) =>
    toast(
      текст,
      {
        label: т('Отменить'),
        onClick: () => {
          вернуть()
          toast(т('Возвращено'))
        },
      },
      { duration: ОТМЕНА_МС },
    )

  return {
    сОтменой,

    операцию(t: Transaction) {
      store.deleteTransaction(t.id)
      сОтменой(т('Операция удалена'), () => store.restoreTransactions([t]))
    },

    категорию(id: string) {
      const с = снимокКатегории(store.data, id)
      if (!с) return
      store.deleteCategory(id)
      сОтменой(т('Категория «{0}» удалена', с.категория.name), () => store.setData((d) => вернутьКатегорию(d, с)))
    },

    счёт(id: string) {
      const с = снимокСчёта(store.data, id)
      if (!с) return
      store.deleteAccount(id)
      сОтменой(т('Счёт «{0}» удалён', с.счёт.name), () => store.setData((d) => вернутьСчёт(d, с)))
    },

    цель(id: string) {
      const с = снимокЗаписи(store.data, 'goals', id)
      if (!с) return
      store.deleteGoal(id)
      сОтменой(т('Цель «{0}» удалена', с.запись.name), () => store.setData((d) => вернутьЗапись(d, с)))
    },

    регулярный(id: string) {
      const с = снимокЗаписи(store.data, 'recurring', id)
      if (!с) return
      store.deleteRecurring(id)
      сОтменой(т('Регулярный платёж «{0}» удалён', с.запись.title), () => store.setData((d) => вернутьЗапись(d, с)))
    },

    напоминание(id: string) {
      const с = снимокЗаписи(store.data, 'reminders', id)
      if (!с) return
      store.deleteReminder(id)
      сОтменой(т('Напоминание «{0}» удалено', с.запись.title), () => store.setData((d) => вернутьЗапись(d, с)))
    },

    задачу(id: string) {
      const с = снимокЗаписи(store.data, 'tasks', id)
      if (!с) return
      store.deleteTask(id)
      сОтменой(т('Задача «{0}» удалена', с.запись.title), () => store.setData((d) => вернутьЗапись(d, с)))
    },

    /** Тег снимается функцией окна «Теги»; здесь — снимок до и отмена после. */
    тег(тег: string, снять: () => void) {
      const с = снимокТега(store.data, тег)
      снять()
      сОтменой(т('Тег #{0} убран', тег), () => {
        // Операции пишутся по месяцам, правила — в основной файл: отмечаем оба.
        store.setData((d) => вернутьТег(d, с), [...new Set(с.операции.map((x) => x.месяц))])
        store.setData((d) => d)
      })
    },
  }
}
