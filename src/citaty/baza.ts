/*
 * База цитат Кошеля.
 *
 * Идея программы: «Деньги — не свобода, а лучший инструмент достижения
 * свободы. Можно много зарабатывать и остаться рабом — дорогим, но рабом,
 * если продаёшь за деньги честь. Свободен тот, кому деньги служат, а не тот,
 * кто служит деньгам. Береги честь смолоду — и богатей.»
 *
 * Каждое пояснение «К чему это» отвечает, как мысль делает человека
 * свободнее. Деньги в пояснениях — средство, никогда не цель.
 *
 * Как пополнять:
 * - дописывать записи в конец списка, любым числом;
 * - id — навсегда: по нему хранятся избранное и «Были раньше». Переименовать
 *   id — значит потерять цитату у всех, кто её отметил;
 * - текст без кавычек-ёлочек, их ставит окно;
 * - точно: true — дословно по источнику (✓), false — устоявшаяся
 *   формулировка (≈), тогда в оговорке — как в подлиннике;
 * - ситуации: под какое положение человека цитата подходит (см. Ситуация);
 * - en — перевод; чего в нём нет, показывается по-русски;
 * - нового автора завести в avtory.ts, портрет — в portrety (только
 *   свободный, см. ISTOCHNIKI.md).
 *
 * Самопроверка следит, чтобы id не повторялись, авторы находились, а
 * пояснение было у каждой записи.
 *
 * Этот файл — данные: сторож перевода его не проверяет.
 */

/**
 * Под какое положение подходит цитата:
 * money — бережливость и цена вещей, work — дисциплина и привычка,
 * support — когда тяжело, много долгов, hard — когда пора взяться за ум,
 * goal — воля и большие планы, wisdom — на каждый день,
 * honor — честь, которую не продают.
 */
export type Ситуация = 'money' | 'work' | 'support' | 'hard' | 'goal' | 'wisdom' | 'honor'

export interface Цитата {
  /** Навсегда: по нему хранится избранное. */
  id: string
  /** id из АВТОРЫ. */
  автор: string
  текст: string
  источник?: string
  /** ✓ — дословно; ≈ — устоявшаяся формулировка. */
  точно: boolean
  /** Для ≈: как сказано в подлиннике. */
  оговорка?: string
  ситуации: Ситуация[]
  /** «К чему это» — 2–3 предложения: как мысль делает свободнее. */
  кЧему: string
  en?: { текст?: string; источник?: string; оговорка?: string; кЧему?: string }
}

/** Девиз Кошеля. Первая цитата при первом запуске и в избранном по умолчанию. */
export const ДЕВИЗ = 'dostoevsky-svoboda'

const Ц = (ц: Цитата): Цитата => ц

export const ЦИТАТЫ: Цитата[] = [
  Ц({
    id: 'dostoevsky-svoboda', автор: 'dostoevsky', точно: true,
    текст: 'Деньги есть чеканенная свобода, а потому для человека, совершенно лишённого свободы, они дороже вдесятеро.',
    источник: '«Записки из Мёртвого дома»',
    ситуации: ['money', 'goal', 'honor'],
    кЧему: 'Деньги — не сама свобода, а лучший инструмент её достижения: каждый сбережённый рубль — выбор, который у тебя больше никто не отнимет. Только не продавай за них честь — иначе станешь не свободным, а дорогим рабом.',
    en: {
      текст: 'Money is coined freedom, and so for a man utterly deprived of freedom it is ten times dearer.',
      источник: '“Notes from the House of the Dead”',
      кЧему: 'Money is not freedom itself but the best tool for reaching it: every rouble saved is a choice nobody can take from you. Just never sell your honour for it — or you become not free, but an expensive slave.',
    },
  }),

  // ------------------------------------------------ Древняя Русь
  Ц({
    id: 'nevsky-pravda', автор: 'nevsky', точно: true,
    текст: 'Не в силе Бог, а в правде.',
    источник: 'Житие Александра Невского',
    ситуации: ['support', 'wisdom', 'honor'],
    кЧему: 'Сила денег и связей приходит и уходит, а правота остаётся с тобой. Кто ведёт дела честно, тому не нужно бояться проверок, должников и собственной совести — это и есть свобода.',
    en: {
      текст: 'God is not in might, but in truth.',
      источник: 'Life of Alexander Nevsky',
      кЧему: 'The power of money and connections comes and goes; being in the right stays with you. Whoever deals honestly need not fear audits, creditors or his own conscience — and that is freedom.',
    },
  }),
  Ц({
    id: 'monomah-uchites', автор: 'monomah', точно: true,
    текст: 'Что умеете хорошего, того не забывайте, а чего не умеете, тому учитесь.',
    источник: '«Поучение»',
    ситуации: ['work', 'goal'],
    кЧему: 'Умение — капитал, который нельзя отнять, заморозить или обесценить. Чем больше умеешь, тем меньше зависишь от одного работодателя и одного дохода.',
    en: {
      текст: 'What good you know, do not forget; and what you do not know, learn.',
      источник: '“Instruction”',
      кЧему: 'Skill is capital that cannot be seized, frozen or devalued. The more you can do, the less you depend on a single employer or a single income.',
    },
  }),
  Ц({
    id: 'monomah-lenost', автор: 'monomah', точно: true,
    текст: 'Леность ведь всему мать: что кто умеет, то забудет, а чего не умеет, тому не научится.',
    источник: '«Поучение»',
    ситуации: ['hard', 'work'],
    кЧему: 'Лень не отдыхает — она тихо отбирает то, что у тебя уже было. Каждый пропущенный день учёта и труда — шаг назад к зависимости.',
    en: {
      текст: 'Sloth is the mother of all: what a man knows he forgets, and what he does not know he never learns.',
      источник: '“Instruction”',
      кЧему: 'Laziness does not rest — it quietly takes away what you already had. Every skipped day of work and bookkeeping is a step back towards dependence.',
    },
  }),
  Ц({
    id: 'minin-imenie', автор: 'minin', точно: false,
    текст: 'Не пожалеем имения своего, не пожалеем ничего: дворы продадим, жён и детей заложим.',
    оговорка: 'по летописному пересказу его призыва',
    ситуации: ['goal', 'honor'],
    кЧему: 'Минин копил не ради сундука: когда пришёл час, деньги нижегородцев купили свободу всей страны. Сбережения нужны, чтобы в решающий момент тебе было чем постоять за своё.',
    en: {
      текст: 'Let us not spare our goods, let us spare nothing: we shall sell our homes and pledge our wives and children.',
      оговорка: 'as retold in the chronicles',
      кЧему: 'Minin did not save for the sake of the chest: when the hour came, the townsfolk’s money bought freedom for the whole country. Savings exist so that, at the decisive moment, you have the means to stand up for what is yours.',
    },
  }),

  // ------------------------------------------------ XVIII век
  Ц({
    id: 'petr-nebyvaemoe', автор: 'petr1', точно: true,
    текст: 'Небываемое бывает.',
    источник: 'надпись на медали 1703 г.',
    ситуации: ['support', 'goal'],
    кЧему: 'Пётр взял шведские корабли на лодках — то, что считалось невозможным. Закрыть долг, собрать подушку, выйти в плюс — тоже кажется небываемым, пока не начнёшь.',
    en: {
      текст: 'The unprecedented happens.',
      источник: 'inscription on a 1703 medal',
      кЧему: 'Peter captured Swedish warships from rowing boats — something thought impossible. Paying off a debt, building a cushion, getting into the black also seem impossible until you start.',
    },
  }),
  Ц({
    id: 'petr-promedlenie', автор: 'petr1', точно: false,
    текст: 'Промедление смерти подобно.',
    оговорка: 'в письме Сенату 1711 г.: «…яко смерти безвозвратной подобно»',
    ситуации: ['hard'],
    кЧему: 'Проценты по долгу капают каждый день, пока ты откладываешь решение. Решить сегодня — значит вернуть себе власть над завтрашним днём.',
    en: {
      текст: 'Delay is like death.',
      оговорка: 'in a 1711 letter to the Senate: “…like death beyond recall”',
      кЧему: 'Interest on a debt drips every day you put off the decision. Deciding today means taking back control of tomorrow.',
    },
  }),
  Ц({
    id: 'lomonosov-trud', автор: 'lomonosov', точно: true,
    текст: 'Неусыпный труд препятствия преодолевает.',
    источник: '«Краткое руководство к красноречию»',
    ситуации: ['work', 'support'],
    кЧему: 'Сын рыбака без денег и связей дошёл до академии одним упорством. Упорный труд — единственный капитал, который есть у каждого с первого дня.',
    en: {
      текст: 'Tireless labour overcomes obstacles.',
      источник: '“A Short Guide to Rhetoric”',
      кЧему: 'A fisherman’s son with neither money nor connections reached the Academy by persistence alone. Steady work is the one capital everyone has from day one.',
    },
  }),
  Ц({
    id: 'lomonosov-platonov', автор: 'lomonosov', точно: true,
    текст: 'Может собственных Платонов и быстрых разумом Невтонов Российская земля рождать.',
    источник: 'ода 1747 г.',
    ситуации: ['goal'],
    кЧему: 'Ломоносов верил, что русский человек способен на первое место в мире. Не соглашайся на малое: твой потолок — не тот, что тебе назначили.',
    en: {
      текст: 'The Russian land can give birth to its own Platos and quick-witted Newtons.',
      источник: 'ode of 1747',
      кЧему: 'Lomonosov believed a Russian could stand first in the world. Do not settle for little: your ceiling is not the one others assigned you.',
    },
  }),
  Ц({
    id: 'lomonosov-sohranenie', автор: 'lomonosov', точно: true,
    текст: 'Сколько чего у одного тела отнимется, столько присовокупится к другому.',
    источник: 'письмо Эйлеру, 1748',
    ситуации: ['money', 'wisdom'],
    кЧему: 'Закон сохранения работает и в кошельке: каждая лишняя трата где-то становится чужим доходом. Смотри, кому уходят твои деньги, — и решай, кому их отдавать.',
    en: {
      текст: 'Whatever is taken from one body is added to another.',
      источник: 'letter to Euler, 1748',
      кЧему: 'The law of conservation works in your wallet too: every needless purchase becomes someone else’s income. Watch where your money goes — and decide whom you give it to.',
    },
  }),
  Ц({
    id: 'suvorov-uchenie', автор: 'suvorov', точно: true,
    текст: 'Тяжело в ученье — легко в походе.',
    источник: '«Наука побеждать»; в народе — «…легко в бою»',
    ситуации: ['work'],
    кЧему: 'Привычка записывать траты и жить по плану — это ученье. Когда придёт трудный месяц, она сделает его лёгким.',
    en: {
      текст: 'Hard in training, easy on the march.',
      источник: '“The Science of Victory”',
      кЧему: 'The habit of logging expenses and living by a plan is the training. When a hard month comes, it will make it easy.',
    },
  }),
  Ц({
    id: 'suvorov-manevr', автор: 'suvorov', точно: true,
    текст: 'Каждый воин должен понимать свой манёвр.',
    источник: '«Наука побеждать»',
    ситуации: ['goal'],
    кЧему: 'Деньги слушаются того, кто знает, зачем копит. Назови цель — и каждая отложенная сумма станет шагом, а не жертвой.',
    en: {
      текст: 'Every soldier must understand his manoeuvre.',
      источник: '“The Science of Victory”',
      кЧему: 'Money obeys those who know why they save. Name the goal, and every sum set aside becomes a step rather than a sacrifice.',
    },
  }),
  Ц({
    id: 'suvorov-pulya', автор: 'suvorov', точно: true,
    текст: 'Пуля — дура, штык — молодец.',
    источник: '«Наука побеждать»',
    ситуации: ['hard'],
    кЧему: 'Надежда на удачу — пуля наугад; решительное собственное действие — штык. Не жди выигрыша и чуда, бери дело в свои руки.',
    en: {
      текст: 'The bullet is a fool, the bayonet a fine fellow.',
      источник: '“The Science of Victory”',
      кЧему: 'Hoping for luck is a stray bullet; decisive action of your own is the bayonet. Do not wait for a windfall — take matters into your own hands.',
    },
  }),
  Ц({
    id: 'suvorov-tovarishch', автор: 'suvorov', точно: false,
    текст: 'Сам погибай, а товарища выручай.',
    оговорка: 'приписывается; близко к его наставлениям',
    ситуации: ['support', 'honor'],
    кЧему: 'Свободный человек может позволить себе помочь — для этого и нужен запас. Но помогать так, чтобы не утонуть самому, — тоже честь.',
    en: {
      текст: 'Perish yourself, but rescue your comrade.',
      оговорка: 'attributed; close to his teachings',
      кЧему: 'A free person can afford to help — that is what a reserve is for. But helping without drowning yourself is a matter of honour too.',
    },
  }),
  Ц({
    id: 'derzhavin-reka', автор: 'derzhavin', точно: true,
    текст: 'Река времён в своём стремленье уносит все дела людей.',
    источник: 'последнее стихотворение, 1816',
    ситуации: ['wisdom'],
    кЧему: 'Вещи стареют, моды уходят, а время не возвращается. Трать деньги на то, что даёт тебе свободу и смысл, а не на то, что река унесёт к следующему сезону.',
    en: {
      текст: 'The river of time in its rushing carries away all the deeds of men.',
      источник: 'his last poem, 1816',
      кЧему: 'Things age, fashions pass, time never returns. Spend money on what gives you freedom and meaning, not on what the river will carry off by next season.',
    },
  }),

  // ------------------------------------------------ Крылов
  Ц({
    id: 'krylov-strekoza', автор: 'krylov', точно: true,
    текст: 'Ты всё пела? Это дело: так пойди же, попляши!',
    источник: '«Стрекоза и Муравей»',
    ситуации: ['money', 'hard'],
    кЧему: 'Лето всегда кончается. Подушка, собранная в хорошие месяцы, — это свобода не просить в плохие.',
    en: {
      текст: 'You sang all summer? Very well — now go and dance!',
      источник: '“The Dragonfly and the Ant”',
      кЧему: 'Summer always ends. A cushion built in the good months is the freedom not to beg in the bad ones.',
    },
  }),
  Ц({
    id: 'krylov-kvartet', автор: 'krylov', точно: true,
    текст: 'А вы, друзья, как ни садитесь, всё в музыканты не годитесь.',
    источник: '«Квартет»',
    ситуации: ['hard'],
    кЧему: 'Перекладывать траты между категориями — не то же самое, что тратить меньше. Чтобы бюджет сошёлся, нужно менять привычки, а не таблицу.',
    en: {
      текст: 'However you sit, my friends, you are no musicians.',
      источник: '“The Quartet”',
      кЧему: 'Shuffling expenses between categories is not the same as spending less. To balance a budget you change habits, not the spreadsheet.',
    },
  }),
  Ц({
    id: 'krylov-sapozhnik', автор: 'krylov', точно: true,
    текст: 'Беда, коль пироги начнёт печи сапожник, а сапоги тачать пирожник.',
    источник: '«Щука и Кот»',
    ситуации: ['wisdom', 'money'],
    кЧему: 'Не вкладывай в то, чего не понимаешь, только потому, что сосед разбогател. Свобода — в деле, которое знаешь сам.',
    en: {
      текст: 'Trouble comes when a cobbler starts baking pies and a pieman starts making boots.',
      источник: '“The Pike and the Cat”',
      кЧему: 'Do not invest in what you do not understand just because a neighbour got rich. Freedom lies in work you know yourself.',
    },
  }),
  Ц({
    id: 'krylov-durak', автор: 'krylov', точно: true,
    текст: 'Услужливый дурак опаснее врага.',
    источник: '«Пустынник и Медведь»',
    ситуации: ['wisdom'],
    кЧему: 'Самые дорогие ошибки часто советуют доброжелатели: «возьми кредит», «вложись, не пожалеешь». Своя голова и свой учёт надёжнее чужой услужливости.',
    en: {
      текст: 'An obliging fool is more dangerous than an enemy.',
      источник: '“The Hermit and the Bear”',
      кЧему: 'The costliest mistakes are often urged by well-wishers: “take the loan”, “invest, you won’t regret it”. Your own head and your own books are safer than someone else’s helpfulness.',
    },
  }),
  Ц({
    id: 'krylov-vaska', автор: 'krylov', точно: true,
    текст: 'А Васька слушает да ест.',
    источник: '«Кот и Повар»',
    ситуации: ['hard'],
    кЧему: 'Уговоры не останавливают утечку денег — останавливает действие. Подписку, которую давно хотел отменить, отмени сегодня.',
    en: {
      текст: 'And Vaska listens — and keeps eating.',
      источник: '“The Cat and the Cook”',
      кЧему: 'Lectures do not stop money leaking away — action does. The subscription you have meant to cancel for months, cancel today.',
    },
  }),

  // ------------------------------------------------ Золотой век
  Ц({
    id: 'zhukovsky-byli', автор: 'zhukovsky', точно: true,
    текст: 'О милых спутниках, которые наш свет своим сопутствием для нас животворили, не говори с тоской: их нет; но с благодарностию: были.',
    источник: '«Воспоминание»',
    ситуации: ['support'],
    кЧему: 'Потерянные деньги и упущенные возможности не стоят того, чтобы о них горевать годами. Благодари за опыт и иди дальше налегке — сожаление тоже кандалы.',
    en: {
      текст: 'Of the dear companions who brought our world to life by their company, do not say with longing “they are gone”, but with gratitude: “they were”.',
      источник: '“Remembrance”',
      кЧему: 'Lost money and missed chances are not worth years of grief. Be grateful for the lesson and travel on light — regret is a shackle too.',
    },
  }),
  Ц({
    id: 'griboedov-sluzhit', автор: 'griboedov', точно: true,
    текст: 'Служить бы рад, прислуживаться тошно.',
    источник: '«Горе от ума»',
    ситуации: ['honor', 'wisdom'],
    кЧему: 'Служить делу — честь, прислуживаться ради денег — рабство. Подушка в банке даёт право сказать «нет» тому, кто требует поступиться совестью.',
    en: {
      текст: 'I would gladly serve, but fawning makes me sick.',
      источник: '“Woe from Wit”',
      кЧему: 'Serving a cause is honour; fawning for money is slavery. A cushion in the bank gives you the right to say “no” to anyone who asks you to bend your conscience.',
    },
  }),
  Ц({
    id: 'griboedov-chasov', автор: 'griboedov', точно: true,
    текст: 'Счастливые часов не наблюдают.',
    источник: '«Горе от ума»',
    ситуации: ['support'],
    кЧему: 'Деньги нужны, чтобы купить время для того, что любишь. Если работа и дом не дают тебе забыть о часах — это повод что-то менять, и запас поможет решиться.',
    en: {
      текст: 'The happy do not watch the clock.',
      источник: '“Woe from Wit”',
      кЧему: 'Money exists to buy time for what you love. If work and home never let you forget the clock, it is a reason to change something — and savings help you dare.',
    },
  }),
  Ц({
    id: 'griboedov-yazyki', автор: 'griboedov', точно: true,
    текст: 'Злые языки страшнее пистолета.',
    источник: '«Горе от ума»',
    ситуации: ['wisdom'],
    кЧему: 'Половина лишних трат — чтобы не судачили: свадьба «как у людей», машина «не хуже, чем у соседа». Свободен тот, кто тратит по своему плану, а не по чужим языкам.',
    en: {
      текст: 'Wicked tongues are deadlier than a pistol.',
      источник: '“Woe from Wit”',
      кЧему: 'Half of all needless spending is to stop the gossip: a wedding “like everyone’s”, a car “no worse than the neighbour’s”. Free is the one who spends by his own plan, not by other people’s tongues.',
    },
  }),
  Ц({
    id: 'griboedov-sudi', автор: 'griboedov', точно: true,
    текст: 'А судьи кто?',
    источник: '«Горе от ума»',
    ситуации: ['hard', 'honor'],
    кЧему: 'Не равняйся на тех, кто живёт в долг напоказ. Твой судья — твой собственный учёт и твоя совесть.',
    en: {
      текст: 'And who are the judges?',
      источник: '“Woe from Wit”',
      кЧему: 'Do not measure yourself against those who live on credit for show. Your judges are your own books and your own conscience.',
    },
  }),
  Ц({
    id: 'pushkin-chest', автор: 'pushkin', точно: true,
    текст: 'Береги честь смолоду.',
    источник: 'эпиграф «Капитанской дочки», народная пословица',
    ситуации: ['honor', 'wisdom'],
    кЧему: 'Честь, как и капитал, копится годами и теряется за один день. Богатей — но так, чтобы ни один рубль не был куплен ценой твоего имени.',
    en: {
      текст: 'Guard your honour from youth.',
      источник: 'epigraph to “The Captain’s Daughter”, a folk proverb',
      кЧему: 'Honour, like capital, builds up over years and is lost in a day. Grow rich — but so that not a single rouble is bought at the price of your name.',
    },
  }),
  Ц({
    id: 'pushkin-privychka', автор: 'pushkin', точно: true,
    текст: 'Привычка свыше нам дана: замена счастию она.',
    источник: '«Евгений Онегин»',
    ситуации: ['work'],
    кЧему: 'Богатство строится не рывками, а привычками: записать трату, отложить десятую часть, проверить план. Хорошая привычка работает на тебя, даже когда нет вдохновения.',
    en: {
      текст: 'Habit is given us from above: it is a substitute for happiness.',
      источник: '“Eugene Onegin”',
      кЧему: 'Wealth is built by habits, not by spurts: log the expense, set aside a tenth, check the plan. A good habit works for you even when inspiration is gone.',
    },
  }),
  Ц({
    id: 'pushkin-ponemnogu', автор: 'pushkin', точно: true,
    текст: 'Мы все учились понемногу чему-нибудь и как-нибудь.',
    источник: '«Евгений Онегин»',
    ситуации: ['hard'],
    кЧему: 'Учиться обращаться с деньгами «как-нибудь» — значит платить за науку процентами. Разберись в своих финансах всерьёз один раз — и они перестанут управлять тобой.',
    en: {
      текст: 'We all learned a little, something and somehow.',
      источник: '“Eugene Onegin”',
      кЧему: 'Learning to handle money “somehow” means paying for the lesson in interest. Get to grips with your finances seriously once — and they stop ruling you.',
    },
  }),
  Ц({
    id: 'pushkin-suety', автор: 'pushkin', точно: true,
    текст: 'Служенье муз не терпит суеты.',
    источник: '«19 октября», 1825',
    ситуации: ['goal'],
    кЧему: 'Большая цель требует спокойствия, а спокойствие — запаса. Кто не мечется от зарплаты до зарплаты, тот может заниматься главным.',
    en: {
      текст: 'Service to the Muses does not tolerate bustle.',
      источник: '“19 October”, 1825',
      кЧему: 'A great aim needs calm, and calm needs a reserve. Whoever is not scrambling from payday to payday can attend to what matters.',
    },
  }),
  Ц({
    id: 'tyutchev-umom', автор: 'tyutchev', точно: true,
    текст: 'Умом Россию не понять, аршином общим не измерить.',
    ситуации: ['wisdom'],
    кЧему: 'Чужие рецепты богатства не всегда годятся для твоей жизни. Мерь своим аршином: свои доходы, свои цели, свой запас прочности.',
    en: {
      текст: 'Russia cannot be understood with the mind, nor measured with a common yardstick.',
      кЧему: 'Other people’s recipes for wealth do not always fit your life. Measure with your own yardstick: your income, your goals, your margin of safety.',
    },
  }),
  Ц({
    id: 'tyutchev-slovo', автор: 'tyutchev', точно: true,
    текст: 'Нам не дано предугадать, как слово наше отзовётся.',
    ситуации: ['wisdom'],
    кЧему: 'Будущее не предугадать — поэтому и нужна подушка. Она превращает неожиданность из беды в неудобство.',
    en: {
      текст: 'It is not given us to foresee how our word will echo.',
      кЧему: 'The future cannot be foreseen — that is exactly why a cushion is needed. It turns a surprise from a disaster into an inconvenience.',
    },
  }),
  Ц({
    id: 'gogol-kopeyka', автор: 'gogol', точно: true,
    текст: 'А больше всего береги и копи копейку: эта вещь надёжнее всего на свете.',
    источник: '«Мёртвые души», наказ отца Чичикову',
    ситуации: ['money'],
    кЧему: 'Совет отца Чичикова верен наполовину: копейку беречь надо, но не ради самой копейки. Чичиков копил, продавая честь, и остался ни с чем — копи так, чтобы копейка служила тебе, а не ты ей.',
    en: {
      текст: 'Above all, take care of and save the kopeck: it is the most reliable thing in the world.',
      источник: '“Dead Souls”, a father’s advice to Chichikov',
      кЧему: 'The father’s advice is half right: the kopeck must be guarded, but not for its own sake. Chichikov saved by selling his honour and ended with nothing — save so that the kopeck serves you, not you it.',
    },
  }),
  Ц({
    id: 'lermontov-parus', автор: 'lermontov', точно: true,
    текст: 'А он, мятежный, просит бури, как будто в буре есть покой!',
    источник: '«Парус»',
    ситуации: ['support', 'goal'],
    кЧему: 'Трудные времена закаляют, если ты к ним готов. Запас — это киль, который не даёт парусу перевернуться в бурю.',
    en: {
      текст: 'But it, rebellious, begs for storms, as if in storms there could be peace!',
      источник: '“The Sail”',
      кЧему: 'Hard times temper you if you are ready for them. A reserve is the keel that keeps the sail from capsizing in a storm.',
    },
  }),
  Ц({
    id: 'turgenev-yazyk', автор: 'turgenev', точно: true,
    текст: 'Во дни сомнений, во дни тягостных раздумий о судьбах моей родины — ты один мне поддержка и опора, о великий, могучий, правдивый и свободный русский язык!',
    источник: '«Русский язык»',
    ситуации: ['support'],
    кЧему: 'В тяжёлый день опирайся на то, что у тебя никто не отнимет: язык, знания, умение трудиться. Это твой главный капитал — с ним можно начать заново где угодно.',
    en: {
      текст: 'In days of doubt, in days of painful brooding over my country’s fate, you alone are my support and stay, O great, mighty, truthful and free Russian language!',
      источник: '“The Russian Language”',
      кЧему: 'On a hard day, lean on what no one can take from you: your language, your knowledge, your ability to work. That is your main capital — with it you can start over anywhere.',
    },
  }),

  // ------------------------------------------------ Достоевский
  Ц({
    id: 'dostoevsky-shirok', автор: 'dostoevsky', точно: true,
    текст: 'Широк человек, я бы сузил.',
    источник: '«Братья Карамазовы»',
    ситуации: ['wisdom', 'hard'],
    кЧему: 'Желаний всегда больше, чем денег. Сузить их до главного — не бедность, а сила: кто хочет немногого, того трудно купить.',
    en: {
      текст: 'Man is broad — too broad; I would narrow him.',
      источник: '“The Brothers Karamazov”',
      кЧему: 'Wants always outnumber money. Narrowing them to what matters is not poverty but strength: a person who wants little is hard to buy.',
    },
  }),
  Ц({
    id: 'dostoevsky-krasota', автор: 'dostoevsky', точно: true,
    текст: 'Красота спасёт мир.',
    источник: '«Идиот», слова о князе Мышкине',
    ситуации: ['support'],
    кЧему: 'Деньги нужны не для того, чтобы ими любоваться, а чтобы освободить в жизни место для прекрасного. Оставь в бюджете строчку на то, что делает тебя живым.',
    en: {
      текст: 'Beauty will save the world.',
      источник: '“The Idiot”, said of Prince Myshkin',
      кЧему: 'Money is not there to be admired but to free up room in life for beauty. Keep a line in your budget for whatever makes you feel alive.',
    },
  }),
  Ц({
    id: 'nekrasov-grazhdanin', автор: 'nekrasov', точно: true,
    текст: 'Поэтом можешь ты не быть, но гражданином быть обязан.',
    источник: '«Поэт и гражданин»',
    ситуации: ['hard', 'honor'],
    кЧему: 'Можно не быть богачом, но платить по своим обязательствам — долг каждого. Честно закрытый долг делает человека свободнее любой покупки.',
    en: {
      текст: 'You need not be a poet, but you are bound to be a citizen.',
      источник: '“The Poet and the Citizen”',
      кЧему: 'You need not be rich, but paying what you owe is everyone’s duty. A debt honestly closed makes a person freer than any purchase.',
    },
  }),
  Ц({
    id: 'prutkov-koren', автор: 'prutkov', точно: true,
    текст: 'Зри в корень!',
    ситуации: ['wisdom'],
    кЧему: 'Деньги кончаются не из-за крупных покупок, а из-за мелких ежедневных утечек. Найди корень — и прекратишь работать на чужие кошельки.',
    en: {
      текст: 'Look to the root!',
      кЧему: 'Money runs out not because of big purchases but because of small daily leaks. Find the root, and you stop working for other people’s wallets.',
    },
  }),
  Ц({
    id: 'prutkov-neobyatnoe', автор: 'prutkov', точно: true,
    текст: 'Никто не обнимет необъятного.',
    ситуации: ['goal'],
    кЧему: 'Десять целей сразу — это ни одной. Выбери главную, доведи до конца, и освободившиеся силы и деньги сами пойдут на следующую.',
    en: {
      текст: 'No one can embrace the unembraceable.',
      кЧему: 'Ten goals at once means none. Pick the main one, see it through, and the freed-up energy and money will flow to the next.',
    },
  }),
  Ц({
    id: 'prutkov-schastlivym', автор: 'prutkov', точно: true,
    текст: 'Если хочешь быть счастливым, будь им.',
    ситуации: ['support'],
    кЧему: 'Счастье не ждёт, пока на счёте появится круглая сумма. Свобода начинается в тот день, когда ты решаешь, что деньги служат тебе уже сейчас.',
    en: {
      текст: 'If you want to be happy, be happy.',
      кЧему: 'Happiness does not wait for a round number on your account. Freedom starts the day you decide that money serves you already, today.',
    },
  }),

  // ------------------------------------------------ Серебряный век и после
  Ц({
    id: 'tolstoy-semi', автор: 'tolstoy', точно: true,
    текст: 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему.',
    источник: '«Анна Каренина»',
    ситуации: ['wisdom'],
    кЧему: 'Благополучные семьи похожи и в деньгах: живут по средствам, говорят о тратах открыто, копят на общее. Мир в доме — тоже свобода, и её охраняет честный общий бюджет.',
    en: {
      текст: 'All happy families are alike; each unhappy family is unhappy in its own way.',
      источник: '“Anna Karenina”',
      кЧему: 'Happy families are alike with money too: they live within their means, talk about spending openly, save for shared goals. Peace at home is also freedom, and an honest joint budget guards it.',
    },
  }),
  Ц({
    id: 'tolstoy-velichie', автор: 'tolstoy', точно: true,
    текст: 'Нет величия там, где нет простоты, добра и правды.',
    источник: '«Война и мир»',
    ситуации: ['wisdom', 'honor'],
    кЧему: 'Богатство без правды — не величие, а витрина. Простота в тратах и честность в делах дают больше уважения, чем любая роскошь.',
    en: {
      текст: 'There is no greatness where there is no simplicity, goodness and truth.',
      источник: '“War and Peace”',
      кЧему: 'Wealth without truth is not greatness but a shop window. Simplicity in spending and honesty in business earn more respect than any luxury.',
    },
  }),
  Ц({
    id: 'klyuchevsky-proshedshee', автор: 'klyuchevsky', точно: true,
    текст: 'Прошедшее нужно знать не потому, что оно прошло, а потому, что, уходя, оно не умело убрать своих последствий.',
    ситуации: ['wisdom'],
    кЧему: 'Вчерашние траты — это сегодняшний долг или сегодняшний запас. Учёт прошлого нужен, чтобы не повторять его ошибок в будущем.',
    en: {
      текст: 'The past must be known not because it has passed, but because, in leaving, it could not clear away its consequences.',
      кЧему: 'Yesterday’s spending is today’s debt or today’s reserve. Keeping records of the past is how you avoid repeating its mistakes.',
    },
  }),
  Ц({
    id: 'klyuchevsky-istoriya', автор: 'klyuchevsky', точно: false,
    текст: 'История ничему не учит, а только наказывает за незнание уроков.',
    оговорка: 'так в записных книжках; в пересказах — короче',
    ситуации: ['hard'],
    кЧему: 'Кредит, взятый, чтобы закрыть кредит, — урок, который наказывает снова и снова. Выучи его один раз, и он перестанет брать с тебя проценты.',
    en: {
      текст: 'History teaches nothing; it only punishes for not learning its lessons.',
      оговорка: 'so in his notebooks; shorter in retellings',
      кЧему: 'A loan taken to pay off a loan is a lesson that punishes again and again. Learn it once, and it stops charging you interest.',
    },
  }),
  Ц({
    id: 'pavlov-zhizn', автор: 'pavlov', точно: true,
    текст: 'Помните, что наука требует от человека всей его жизни.',
    источник: '«Письмо к молодёжи», 1935',
    ситуации: ['work'],
    кЧему: 'Любое мастерство — и в деле, и в деньгах — требует постоянства. Финансовая свобода не случается в один день: её строят всю жизнь, по шагу.',
    en: {
      текст: 'Remember that science demands of a man his whole life.',
      источник: '“Letter to the Youth”, 1935',
      кЧему: 'Any mastery — in work or in money — takes constancy. Financial freedom does not happen in a day: it is built over a lifetime, step by step.',
    },
  }),
  Ц({
    id: 'pavlov-azbuka', автор: 'pavlov', точно: true,
    текст: 'Изучите азбуку науки, прежде чем пытаться взойти на её вершины.',
    источник: '«Письмо к молодёжи»',
    ситуации: ['goal', 'work'],
    кЧему: 'Прежде чем гнаться за инвестициями, выучи азбуку: доход больше расхода, подушка, никаких долгов на потребление. Без азбуки вершины оказываются обрывом.',
    en: {
      текст: 'Study the ABC of science before you try to climb its heights.',
      источник: '“Letter to the Youth”',
      кЧему: 'Before chasing investments, learn the ABC: income above spending, a cushion, no consumer debt. Without the ABC the heights turn out to be a cliff.',
    },
  }),
  Ц({
    id: 'chekhov-kratkost', автор: 'chekhov', точно: true,
    текст: 'Краткость — сестра таланта.',
    источник: 'письмо брату, 1889',
    ситуации: ['wisdom'],
    кЧему: 'Хороший бюджет тоже краток: несколько ясных правил вместо сотни статей. Простой план легче выполнить — а выполненный план и даёт свободу.',
    en: {
      текст: 'Brevity is the sister of talent.',
      источник: 'letter to his brother, 1889',
      кЧему: 'A good budget is brief too: a few clear rules instead of a hundred lines. A simple plan is easier to keep — and a plan kept is what gives you freedom.',
    },
  }),
  Ц({
    id: 'chekhov-prekrasno', автор: 'chekhov', точно: true,
    текст: 'В человеке должно быть всё прекрасно: и лицо, и одежда, и душа, и мысли.',
    источник: '«Дядя Ваня»',
    ситуации: ['goal'],
    кЧему: 'Порядок в деньгах — часть того же порядка, что и в мыслях. Кто ведёт свои дела достойно, тот и держится свободно.',
    en: {
      текст: 'Everything in a person should be beautiful: face, clothes, soul and thoughts.',
      источник: '“Uncle Vanya”',
      кЧему: 'Order in money is part of the same order as in your thoughts. Whoever keeps his affairs with dignity carries himself as a free man.',
    },
  }),
  Ц({
    id: 'chekhov-rab', автор: 'chekhov', точно: false,
    текст: 'Выдавливать из себя по каплям раба.',
    оговорка: 'письмо Суворину, 1889: «…выдавливает из себя по каплям раба»',
    ситуации: ['hard', 'goal', 'honor'],
    кЧему: 'Рабство начинается с мелочей: с покупки, чтобы не хуже других, с долга до зарплаты. Каждая такая капля, выдавленная из жизни, делает тебя свободнее.',
    en: {
      текст: 'To squeeze the slave out of oneself drop by drop.',
      оговорка: 'letter to Suvorin, 1889: “…squeezes the slave out of himself drop by drop”',
      кЧему: 'Slavery starts with trifles: buying to keep up with others, borrowing until payday. Every such drop squeezed out of your life makes you freer.',
    },
  }),
  Ц({
    id: 'stolypin-velikaya', автор: 'stolypin', точно: true,
    текст: 'Им нужны великие потрясения, нам нужна Великая Россия.',
    источник: 'речь в Думе, 1907',
    ситуации: ['goal'],
    кЧему: 'Богатство строится не потрясениями, а спокойным трудом и своей собственностью. Столыпин давал крестьянину землю, чтобы тот стал хозяином, — стань хозяином своих денег.',
    en: {
      текст: 'They need great upheavals; we need a Great Russia.',
      источник: 'speech in the Duma, 1907',
      кЧему: 'Wealth is built not by upheavals but by calm work and property of your own. Stolypin gave the peasant land so he could become an owner — become the owner of your money.',
    },
  }),
  Ц({
    id: 'stolypin-dvadtsat', автор: 'stolypin', точно: false,
    текст: 'Дайте государству двадцать лет покоя, внутреннего и внешнего, и вы не узнаете нынешней России.',
    оговорка: 'интервью газете «Волга», 1909; формулировка сверяется',
    ситуации: ['support', 'goal'],
    кЧему: 'Большое богатство — дело долгого спокойного роста. Дай своим сбережениям время и покой — и через двадцать лет ты не узнаешь свою жизнь.',
    en: {
      текст: 'Give the state twenty years of peace, at home and abroad, and you will not recognise today’s Russia.',
      оговорка: 'interview with the newspaper “Volga”, 1909; wording being checked',
      кЧему: 'Great wealth is a matter of long, calm growth. Give your savings time and peace — and in twenty years you will not recognise your life.',
    },
  }),
  Ц({
    id: 'tsiolkovsky-kolybel', автор: 'tsiolkovsky', точно: true,
    текст: 'Планета есть колыбель разума, но нельзя вечно жить в колыбели.',
    источник: 'письмо, 1911',
    ситуации: ['goal'],
    кЧему: 'Жить от зарплаты до зарплаты — тоже колыбель: тепло, но тесно. Запас и вложения — твоя ракета, чтобы выйти за пределы привычного.',
    en: {
      текст: 'The planet is the cradle of reason, but one cannot live in the cradle for ever.',
      источник: 'letter, 1911',
      кЧему: 'Living from payday to payday is a cradle too: warm, but cramped. Savings and investment are your rocket for going beyond the familiar.',
    },
  }),
  Ц({
    id: 'bulgakov-ne-prosite', автор: 'bulgakov', точно: true,
    текст: 'Никогда и ничего не просите! Никогда и ничего, и в особенности у тех, кто сильнее вас. Сами предложат и сами всё дадут!',
    источник: '«Мастер и Маргарита»',
    ситуации: ['support', 'honor'],
    кЧему: 'Кто не должен и не просит, тот разговаривает с сильными на равных. Подушка и отсутствие долгов — это достоинство, которое видно со стороны.',
    en: {
      текст: 'Never ask for anything! Never, and especially from those who are stronger than you. They will offer and give everything themselves!',
      источник: '“The Master and Margarita”',
      кЧему: 'Whoever owes nothing and asks for nothing speaks to the powerful as an equal. A cushion and no debts are a dignity others can see.',
    },
  }),
  Ц({
    id: 'bulgakov-rukopisi', автор: 'bulgakov', точно: true,
    текст: 'Рукописи не горят.',
    источник: '«Мастер и Маргарита»',
    ситуации: ['support'],
    кЧему: 'Настоящий труд не пропадает даром, даже если сегодня за него не платят. Делай своё дело честно — его ценность ещё вернётся к тебе.',
    en: {
      текст: 'Manuscripts don’t burn.',
      источник: '“The Master and Margarita”',
      кЧему: 'Real work is never wasted, even if nobody pays for it today. Do your work honestly — its value will come back to you.',
    },
  }),
  Ц({
    id: 'bulgakov-razruha', автор: 'bulgakov', точно: true,
    текст: 'Разруха не в клозетах, а в головах.',
    источник: '«Собачье сердце»',
    ситуации: ['hard'],
    кЧему: 'Беспорядок в деньгах начинается не с маленькой зарплаты, а с беспорядка в голове. Наведи порядок в учёте — и половина бед уйдёт сама.',
    en: {
      текст: 'The ruin is not in the lavatories, but in the heads.',
      источник: '“Heart of a Dog”',
      кЧему: 'Money chaos starts not with a small salary but with chaos in the head. Put your records in order, and half the trouble goes away by itself.',
    },
  }),
  Ц({
    id: 'esenin-rasstoyanie', автор: 'esenin', точно: true,
    текст: 'Лицом к лицу лица не увидать. Большое видится на расстоянье.',
    источник: '«Письмо к женщине»',
    ситуации: ['wisdom'],
    кЧему: 'День за днём кажется, что ничего не меняется. Посмотри на свои деньги за год — и увидишь, как далеко ушёл.',
    en: {
      текст: 'Face to face, you cannot see a face. Great things are seen from a distance.',
      источник: '“Letter to a Woman”',
      кЧему: 'Day by day it seems nothing changes. Look at your money over a year — and you will see how far you have come.',
    },
  }),
  Ц({
    id: 'gagarin-poehali', автор: 'gagarin', точно: true,
    текст: 'Поехали!',
    источник: 'старт «Востока», 12 апреля 1961 г.',
    ситуации: ['goal'],
    кЧему: 'Самый трудный шаг к свободе — первый. Заведи счёт, запиши первую трату, отложи первую сотню — и поехали.',
    en: {
      текст: 'Let’s go!',
      источник: 'Vostok lift-off, 12 April 1961',
      кЧему: 'The hardest step towards freedom is the first. Open an account, log your first expense, put aside your first hundred — and let’s go.',
    },
  }),

  // ------------------------------------------------ народная мудрость
  Ц({
    id: 'narod-kopeyka', автор: 'narod', точно: true,
    текст: 'Копейка рубль бережёт.',
    ситуации: ['money'],
    кЧему: 'Большие суммы складываются из малых решений. Береги копейку не из жадности, а потому что из копеек строится твоя независимость.',
    en: {
      текст: 'The kopeck guards the rouble.',
      кЧему: 'Large sums are made of small decisions. Guard the kopeck not out of greed but because your independence is built out of kopecks.',
    },
  }),
  Ц({
    id: 'narod-odezhka', автор: 'narod', точно: true,
    текст: 'По одёжке протягивай ножки.',
    ситуации: ['money', 'hard'],
    кЧему: 'Жить по средствам — не скупость, а свобода от кредиторов. Кто тратит больше, чем зарабатывает, работает уже не на себя, а на банк.',
    en: {
      текст: 'Stretch your legs according to your blanket.',
      кЧему: 'Living within your means is not meanness but freedom from creditors. Whoever spends more than he earns works no longer for himself but for the bank.',
    },
  }),
  Ц({
    id: 'narod-dolg', автор: 'narod', точно: true,
    текст: 'Долг платежом красен.',
    ситуации: ['money', 'honor', 'support'],
    кЧему: 'Вовремя отданный долг возвращает тебе доброе имя и спокойный сон. Каждый платёж — шаг из зависимости к свободе.',
    en: {
      текст: 'A debt is graced by its payment.',
      кЧему: 'A debt repaid on time gives back your good name and your sleep. Every payment is a step out of dependence towards freedom.',
    },
  }),
  Ц({
    id: 'narod-rybka', автор: 'narod', точно: true,
    текст: 'Без труда не вынешь и рыбку из пруда.',
    ситуации: ['work'],
    кЧему: 'Лёгких денег не бывает, бывают дорогие ошибки. Свой труд — самый честный и самый надёжный путь к достатку.',
    en: {
      текст: 'Without effort you cannot even pull a fish out of a pond.',
      кЧему: 'There is no easy money, only expensive mistakes. Your own work is the most honest and most reliable road to prosperity.',
    },
  }),
  Ц({
    id: 'narod-otmer', автор: 'narod', точно: true,
    текст: 'Семь раз отмерь — один раз отрежь.',
    ситуации: ['money', 'wisdom'],
    кЧему: 'Перед крупной покупкой или кредитом посмотри на прогноз и подумай ещё раз. Один необдуманный договор может связать на годы.',
    en: {
      текст: 'Measure seven times, cut once.',
      кЧему: 'Before a big purchase or a loan, look at the forecast and think again. One rash contract can bind you for years.',
    },
  }),
  Ц({
    id: 'narod-lozhka', автор: 'narod', точно: true,
    текст: 'Дорога ложка к обеду.',
    ситуации: ['money'],
    кЧему: 'Деньги ценнее всего тогда, когда они под рукой в нужный момент. Подушка — это ложка, которая всегда есть к обеду.',
    en: {
      текст: 'A spoon is precious at dinnertime.',
      кЧему: 'Money is worth most when it is at hand at the right moment. A cushion is the spoon that is always there at dinner.',
    },
  }),
  Ц({
    id: 'narod-druzey', автор: 'narod', точно: true,
    текст: 'Не имей сто рублей, а имей сто друзей.',
    ситуации: ['support'],
    кЧему: 'Деньги — инструмент, а люди — опора. Не меняй дружбу на выгоду: это та честь, которую нельзя продавать.',
    en: {
      текст: 'Better a hundred friends than a hundred roubles.',
      кЧему: 'Money is a tool; people are your support. Never trade friendship for gain — that is an honour not for sale.',
    },
  }),
  Ц({
    id: 'narod-terpenie', автор: 'narod', точно: true,
    текст: 'Терпение и труд всё перетрут.',
    ситуации: ['support', 'work'],
    кЧему: 'Долг, который кажется горой, стачивается регулярными платежами. Терпение плюс план — и гора станет ровной дорогой.',
    en: {
      текст: 'Patience and labour will grind through anything.',
      кЧему: 'A debt that looks like a mountain is worn down by regular payments. Patience plus a plan, and the mountain becomes a level road.',
    },
  }),
  Ц({
    id: 'narod-tishe', автор: 'narod', точно: true,
    текст: 'Тише едешь — дальше будешь.',
    ситуации: ['goal'],
    кЧему: 'Сложный процент любит спокойных. Каждый месяц понемногу — и через годы ты дальше тех, кто гнался за быстрым богатством.',
    en: {
      текст: 'The slower you go, the further you get.',
      кЧему: 'Compound interest favours the calm. A little every month, and in a few years you are further ahead than those who chased quick riches.',
    },
  }),
  Ц({
    id: 'narod-master', автор: 'narod', точно: true,
    текст: 'Дело мастера боится.',
    ситуации: ['work'],
    кЧему: 'Чем лучше ты знаешь своё дело, тем дороже стоит твой труд и тем меньше ты зависишь от чужой милости. Мастерство — самая надёжная валюта.',
    en: {
      текст: 'The work fears the master.',
      кЧему: 'The better you know your craft, the more your work is worth and the less you depend on anyone’s favour. Mastery is the most reliable currency.',
    },
  }),
  // ================================================ из книг, сверено с полным текстом
  // Каждая запись — отдельный блок: убрать цитату значит удалить её блок целиком.

  // ------------------------------------------------ Врангель, «Записки. Оборона Крыма»
  Ц({
    id: 'vrangel-chest-znameni', автор: 'vrangel', точно: true,
    текст: 'Самое большее, что можно от него требовать — это сохранить честь вверенного армии русского знамени.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor'],
    кЧему: 'Бывают времена, когда выиграть нельзя, а сохранить честь можно всегда. Денежные неудачи проходят, а имя, которое ты не продал, остаётся с тобой.',
    en: {
      текст: 'The most that can be demanded of him is to keep the honour of the Russian banner entrusted to the army.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'There are times when you cannot win, but you can always keep your honour. Money troubles pass; a name you never sold stays with you.',
    },
  }),
  Ц({
    id: 'vrangel-ne-sklonit', автор: 'vrangel', точно: true,
    текст: 'Я могу обещать лишь одно: не склонить знамени перед врагом и, если нам суждено будет погибнуть, то сохранить честь русского знамени до конца.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor', 'hard'],
    кЧему: 'Обещай только то, что точно выполнишь, — так поступают свободные люди. Кто не склоняется перед кредитором и соблазном лёгких денег, тот остаётся хозяином себе даже в трудный год.',
    en: {
      текст: 'I can promise only one thing: not to lower the banner before the enemy and, if we are fated to perish, to keep the honour of the Russian banner to the end.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Promise only what you will surely keep — that is how free people act. Whoever does not bow to creditors or to the lure of easy money stays his own master even in a hard year.',
    },
  }),
  Ц({
    id: 'vrangel-slovo', автор: 'vrangel', точно: true,
    текст: 'Мне лично нет надобности в письменном подтверждении слов каждого из здесь присутствующих.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor'],
    кЧему: 'Слово честного человека стоит расписки. Держи своё слово в денежных делах — и тебе будут верить без бумаг, а это капитал, который не купишь.',
    en: {
      текст: 'Personally I have no need of a written confirmation of the word of each person present here.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'An honest man’s word is worth a receipt. Keep your word in money matters, and people will trust you without paperwork — a capital no one can buy.',
    },
  }),
  Ц({
    id: 'vrangel-chasha', автор: 'vrangel', точно: true,
    текст: 'Я делил с армией славу побед и не могу отказаться испить с ней чашу унижения.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor', 'support'],
    кЧему: 'Кто был с семьёй и делом в удаче, тот не бросает их в беде. Трудный месяц, пережитый вместе и честно, сближает сильнее любого богатства.',
    en: {
      текст: 'I shared the glory of victories with the army and cannot refuse to drink the cup of humiliation with it.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Whoever stood by family and work in good fortune does not abandon them in trouble. A hard month lived through together and honestly binds people closer than any wealth.',
    },
  }),
  Ц({
    id: 'vrangel-duh-zhiv', автор: 'vrangel', точно: true,
    текст: 'Последние бои показали, что непобедимый дух в армии еще жив. А раз жив дух, то не все еще потеряно.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['support'],
    кЧему: 'Долги и минус на счёте — это не конец, пока ты не сдался. Пока жив дух, можно начать заново: записать траты, составить план, сделать первый платёж.',
    en: {
      текст: 'The last battles showed that the invincible spirit of the army is still alive. And while the spirit is alive, not everything is lost.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Debts and a negative balance are not the end as long as you have not given up. While the spirit lives you can start again: log your spending, make a plan, make the first payment.',
    },
  }),
  Ц({
    id: 'vrangel-sobstvennost', автор: 'vrangel', точно: true,
    текст: 'Землею должно владеть на правах прочно установленной частной собственности возможно большее число лиц, могущих вкладывать в нее свой труд;',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['work', 'money'],
    кЧему: 'Своя собственность, в которую вложен свой труд, делает человека хозяином, а не работником на чужом. Копи не на вещи, а на то, что будет приносить тебе плоды.',
    en: {
      текст: 'Land should be owned, by the right of firmly established private property, by as many persons as possible who are able to invest their labour in it;',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Property of your own, with your own labour in it, makes a person an owner rather than a hand on someone else’s land. Save not for things but for what will bear fruit for you.',
    },
  }),
  Ц({
    id: 'vrangel-oficerstvo', автор: 'vrangel', точно: true,
    текст: 'Русское офицерство искони верой и правдой служило Родине и беззаветно умирало за ее счастье.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor'],
    кЧему: 'Служить верой и правдой — значит не продавать своё дело за выгоду. Честная служба и честный заработок — та основа, на которой держится достоинство.',
    en: {
      текст: 'The Russian officer corps has always served the Motherland in faith and truth and died selflessly for its happiness.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'To serve in faith and truth is never to sell your work for gain. Honest service and honest earnings are the foundation that dignity stands on.',
    },
  }),
  Ц({
    id: 'vrangel-voznagrazhdenie', автор: 'vrangel', точно: true,
    текст: '…вознаграждение за вложенный в землю труд по ее обработке…',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['work'],
    кЧему: 'Труд, вложенный в своё, должен возвращаться тебе. Смотри, куда идут твои силы: на то, что останется твоим, или на то, что уйдёт к другим.',
    en: {
      текст: '…reward for the labour invested in cultivating the land…',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Labour invested in what is yours should come back to you. Watch where your effort goes: into what stays yours, or into what flows to others.',
    },
  }),
  Ц({
    id: 'vrangel-veroyu', автор: 'vrangel', точно: true,
    текст: 'Верою спасется Россия',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['support'],
    кЧему: 'Без веры в то, что выберешься, не начнёшь даже первого шага. Вера плюс ежедневный труд — вот что выводит из любой ямы.',
    en: {
      текст: 'By faith Russia will be saved',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Without faith that you will get out, you will not take even the first step. Faith plus daily work is what pulls you out of any pit.',
    },
  }),
  Ц({
    id: 'vrangel-mirnyy-trud', автор: 'vrangel', точно: true,
    текст: 'Призываю к защите родины и мирному труду русских людей и обещаю прощение заблудшим, которые вернутся к нам.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['work', 'support'],
    кЧему: 'Ошибся с деньгами — не беда, если вернулся на правильный путь. Мирный ежедневный труд прощает прошлые промахи и строит будущее.',
    en: {
      текст: 'I call the Russian people to defend the homeland and to peaceful labour, and I promise forgiveness to the misguided who return to us.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'A money mistake is no disaster if you return to the right road. Peaceful daily work forgives past slips and builds the future.',
    },
  }),
  Ц({
    id: 'vrangel-zakonnost', автор: 'vrangel', точно: true,
    текст: 'На местах, при командирах корпусов, имелся готовый аппарат гражданской власти; армия высоко несла знамя законности.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor', 'wisdom'],
    кЧему: 'Порядок и законность нужны и в домашних делах: ясные правила, учёт, честные договорённости. Где есть порядок, там нет места панике.',
    en: {
      текст: 'Locally, under the corps commanders, there was a ready apparatus of civil government; the army held high the banner of lawfulness.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Order and lawfulness matter at home too: clear rules, records, honest agreements. Where there is order, there is no room for panic.',
    },
  }),
  Ц({
    id: 'vrangel-ponyatiya-chesti', автор: 'vrangel', точно: true,
    текст: '…воспитывать среди офицерства высокие понятия о чести, воинском долге, традиции старых Императорских армии и флота…',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor'],
    кЧему: 'Понятия о чести воспитываются, как и привычка копить. Начни с малого: не бери чужого, отдавай долги в срок, держи слово.',
    en: {
      текст: '…to cultivate among the officers lofty notions of honour, military duty and the traditions of the old Imperial army and navy…',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Notions of honour are cultivated, just like the habit of saving. Start small: take nothing that is not yours, repay debts on time, keep your word.',
    },
  }),
  Ц({
    id: 'vrangel-plody-raboty', автор: 'vrangel', точно: true,
    текст: '…каждый трудящийся получит возможность спокойно жить плодами своей работы.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['work', 'money'],
    кЧему: 'Жить спокойно плодами своей работы — это и есть свобода, которую дают деньги. Для этого плоды нужно сберечь, а не раздать банкам в виде процентов.',
    en: {
      текст: '…every working person will be able to live peacefully on the fruits of his work.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Living peacefully on the fruits of your work is exactly the freedom money gives. For that, the fruits must be kept, not handed to banks as interest.',
    },
  }),
  Ц({
    id: 'vrangel-vybora-net', автор: 'vrangel', точно: true,
    текст: 'Выбора нет, мы должны бороться, пока есть силы.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['hard'],
    кЧему: 'Когда долги прижали, жалеть себя некогда. Бороться — значит сокращать лишнее и платить каждый месяц, пока долг не кончится.',
    en: {
      текст: 'There is no choice; we must fight while we have the strength.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'When debts press hard there is no time for self-pity. Fighting means cutting the excess and paying every month until the debt is gone.',
    },
  }),
  Ц({
    id: 'vrangel-nuzhdy', автор: 'vrangel', точно: true,
    текст: 'Знаю все ваши нужды, все ваши печали, знаю, что вы отдали всю жизнь службе родине и потеряли все свое достояние.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['support', 'honor'],
    кЧему: 'Можно потерять всё достояние и не потерять себя. Честно прожитая жизнь — то, что остаётся, когда деньги ушли, и с чего можно начать снова.',
    en: {
      текст: 'I know all your needs, all your sorrows; I know that you gave your whole life to the service of the homeland and lost all your possessions.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'You can lose all your possessions without losing yourself. A life lived honestly is what remains when the money is gone — and where you can start again.',
    },
  }),
  Ц({
    id: 'vrangel-voznagradit', автор: 'vrangel', точно: true,
    текст: 'Будем верить, что Мать-Россия в будущем достойно вас вознаградит.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['support'],
    кЧему: 'Честный труд не всегда вознаграждается сразу. Делай своё дело и откладывай понемногу — будущее платит тем, кто к нему готовился.',
    en: {
      текст: 'Let us believe that Mother Russia will reward you worthily in the future.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Honest work is not always rewarded at once. Do your work and put a little aside — the future pays those who prepared for it.',
    },
  }),
  Ц({
    id: 'vrangel-ne-slozhit', автор: 'vrangel', точно: true,
    текст: 'Но и при таких условиях Русская армия не сложит оружия и будет драться с верой в успех…',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['hard', 'support'],
    кЧему: 'Плохие условия — не повод сдаваться. Даже при маленьком доходе можно вести учёт, гасить долг и верить, что дело идёт к лучшему.',
    en: {
      текст: 'But even in such conditions the Russian army will not lay down its arms and will fight on with faith in success…',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Bad conditions are no reason to give up. Even on a small income you can keep records, pay down debt and believe things are getting better.',
    },
  }),
  Ц({
    id: 'vrangel-rabochiy-den', автор: 'vrangel', точно: true,
    текст: 'Наш рабочий день начинался с семи часов и продолжался, почти непрерывно, до одиннадцати-двенадцати часов ночи.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['work'],
    кЧему: 'Большие дела делаются большим трудом. Но труд должен вести к свободе: работай много, чтобы однажды выбирать, на что тратить своё время.',
    en: {
      текст: 'Our working day began at seven o’clock and went on, almost without a break, until eleven or twelve at night.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'Great things are done with great labour. But labour should lead to freedom: work hard so that one day you choose how to spend your time.',
    },
  }),
  Ц({
    id: 'vrangel-ne-kak-nischie', автор: 'vrangel', точно: true,
    текст: 'Мы идем на чужбину, идем не как нищие с протянутой рукой, а с высоко поднятой головой, в сознании выполненного до конца долга.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['honor', 'support'],
    кЧему: 'Нищий не тот, у кого мало денег, а тот, кто протягивает руку. Кто выполнил свой долг, тот идёт с поднятой головой — даже налегке.',
    en: {
      текст: 'We are going to a foreign land, not as beggars with outstretched hands, but with heads held high, conscious of a duty fulfilled to the end.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'A beggar is not one who has little money but one who holds out his hand. Whoever has done his duty walks with his head high — even travelling light.',
    },
  }),
  Ц({
    id: 'vrangel-velik-duh', автор: 'vrangel', точно: true,
    текст: 'Велик русский дух и необъятна русская душа…',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['goal', 'support'],
    кЧему: 'В тебе больше сил, чем кажется в трудный день. Ставь цели по своему духу, а не по своему нынешнему кошельку.',
    en: {
      текст: 'Great is the Russian spirit and boundless the Russian soul…',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'You have more strength than it seems on a hard day. Set goals by the size of your spirit, not by the size of your current wallet.',
    },
  }),
  Ц({
    id: 'vrangel-dvadtsat-pyat-let', автор: 'vrangel', точно: true,
    текст: '…новый владелец через двадцать пять лет погашает весь лежащий на его участке долг и становится полным собственником своего участка.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['money', 'goal'],
    кЧему: 'Долг, взятый на то, что станет твоим, и выплаченный до конца, превращается в собственность. Плати честно и по плану — и в конце пути ты полный хозяин.',
    en: {
      текст: '…in twenty-five years the new owner pays off the whole debt on his plot and becomes its full owner.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'A debt taken for something that will be yours, and paid off to the end, turns into property. Pay honestly and to plan, and at the end of the road you are the full owner.',
    },
  }),
  Ц({
    id: 'vrangel-lisheniya', автор: 'vrangel', точно: true,
    текст: 'Все должны твердо помнить, что нет тех лишений и тягот, которые мы не должны были бы принять на себя для восстановления мира и согласия на Родной Земле.',
    источник: '«Записки. Оборона Крыма»',
    ситуации: ['hard'],
    кЧему: 'Ради мира в доме и свободы от долгов можно потерпеть лишения. Временный отказ от лишнего — небольшая цена за спокойствие на годы.',
    en: {
      текст: 'Everyone must firmly remember that there are no privations and hardships we should not take upon ourselves to restore peace and concord in our native land.',
      источник: '“Memoirs. The Defence of the Crimea”',
      кЧему: 'For peace at home and freedom from debt, some privation can be borne. Giving up extras for a while is a small price for years of calm.',
    },
  }),

  // ------------------------------------------------ Деникин, «Очерки русской смуты»
  Ц({
    id: 'denikin-ne-dozhdutsya', автор: 'denikin', точно: true,
    текст: 'Не дождутся. Из крови, грязи, нищеты духовной и физической встанет русский народ в силе и в разуме.',
    источник: '«Очерки русской смуты»',
    ситуации: ['hard', 'support'],
    кЧему: 'Из любой нищеты можно встать, если взяться за дело с разумом. Не жди, пока за тебя решат: поднимайся сам, шаг за шагом.',
    en: {
      текст: 'They will wait in vain. Out of blood, filth, spiritual and physical poverty the Russian people will rise in strength and in reason.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'You can rise from any poverty if you take on the task with reason. Do not wait for others to decide for you: get up yourself, step by step.',
    },
  }),
  Ц({
    id: 'denikin-predannymi', автор: 'denikin', точно: true,
    текст: '…предпочитая быть преданными, чем самим предать.',
    источник: '«Очерки русской смуты»',
    ситуации: ['honor'],
    кЧему: 'Лучше потерять деньги, чем предать того, кто тебе поверил. Чужие долги перед тобой — их беда; твоя верность слову — твоё богатство.',
    en: {
      текст: '…preferring to be betrayed rather than to betray.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Better to lose money than to betray someone who trusted you. Others’ debts to you are their trouble; your faithfulness to your word is your wealth.',
    },
  }),
  Ц({
    id: 'denikin-podnyatoy-golovoy', автор: 'denikin', точно: true,
    текст: 'Шли с поднятой головой, встречая непонимание, клевету и дикую ненависть, до тех пор, пока хватало сил и жизни.',
    источник: '«Очерки русской смуты»',
    ситуации: ['hard', 'honor'],
    кЧему: 'Кто идёт своим путём, тот встречает непонимание: «зачем копишь», «зачем считаешь каждый рубль». Иди с поднятой головой — свобода стоит чужих насмешек.',
    en: {
      текст: 'They walked with heads held high, meeting incomprehension, slander and savage hatred, for as long as strength and life lasted.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Whoever goes his own way meets incomprehension: “why save?”, “why count every rouble?”. Walk with your head high — freedom is worth other people’s mockery.',
    },
  }),
  Ц({
    id: 'denikin-materialnye', автор: 'denikin', точно: true,
    текст: 'Материальные недостатки мы переживем; духовные же требуют немедленного лечения.',
    источник: '«Очерки русской смуты»',
    ситуации: ['wisdom', 'support'],
    кЧему: 'Нехватку денег можно пережить и исправить. Опаснее уныние и привычка жить без порядка — с них и начинай лечение.',
    en: {
      текст: 'We shall survive material shortages; spiritual ones require immediate treatment.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'A shortage of money can be survived and put right. Despondency and the habit of living without order are more dangerous — start the cure with them.',
    },
  }),
  Ц({
    id: 'denikin-velichie-duha', автор: 'denikin', точно: true,
    текст: 'Достигнуть при всем этом конечных целей, выйти с честью из создавшегося положения, будет зависеть от величия духа русского народа.',
    источник: '«Очерки русской смуты»',
    ситуации: ['goal', 'honor'],
    кЧему: 'Выйти из трудного положения можно по-разному — с честью или без. Выбирай путь, после которого не стыдно смотреть людям в глаза.',
    en: {
      текст: 'Reaching the ultimate goals despite all this, and emerging with honour from the situation, will depend on the greatness of spirit of the Russian people.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'There are different ways out of a hard situation — with honour or without. Choose the road after which you can still look people in the eye.',
    },
  }),
  Ц({
    id: 'denikin-disciplina', автор: 'denikin', точно: true,
    текст: 'Главное, основное условие существования армии — дисциплина.',
    источник: '«Очерки русской смуты»',
    ситуации: ['wisdom', 'work'],
    кЧему: 'Главное условие богатства — тоже дисциплина: записывать, планировать, откладывать каждый месяц. Без неё любой доход утекает сквозь пальцы.',
    en: {
      текст: 'The chief, fundamental condition for the existence of an army is discipline.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'The chief condition of wealth is discipline too: record, plan, save every month. Without it any income slips through your fingers.',
    },
  }),
  Ц({
    id: 'denikin-rossiya-dorozhe', автор: 'denikin', точно: true,
    текст: 'Но для меня Россия бесконечно дороже революции.',
    источник: '«Очерки русской смуты»',
    ситуации: ['honor'],
    кЧему: 'Знай, что тебе дороже всего, — и ни на какие перемены и посулы это не меняй. Деньги — инструмент для дорогого, а не замена ему.',
    en: {
      текст: 'But to me Russia is infinitely dearer than the revolution.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Know what is dearest to you — and do not trade it for any upheaval or promise. Money is a tool for what is dear, not a substitute for it.',
    },
  }),
  Ц({
    id: 'denikin-sogreyte-trud', автор: 'denikin', точно: true,
    текст: 'Согрейте же ваш труд любовью к Родине, и сердечным расположением к солдату…',
    источник: '«Очерки русской смуты»',
    ситуации: ['work'],
    кЧему: 'Труд, согретый смыслом, не выматывает так, как работа ради одной зарплаты. Найди, ради кого и чего ты работаешь, — и деньги станут спокойнее.',
    en: {
      текст: 'Warm your labour, then, with love for the Motherland and heartfelt goodwill towards the soldier…',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Work warmed by meaning does not drain you the way working for a paycheque alone does. Find whom and what you work for — and money will feel calmer.',
    },
  }),
  Ц({
    id: 'denikin-nichego-ne-prosilo', автор: 'denikin', точно: true,
    текст: '…офицерство никогда ничего не просило лично для себя.',
    источник: '«Очерки русской смуты»',
    ситуации: ['honor'],
    кЧему: 'Кто ничего не выпрашивает, тот ни от кого не зависит. Свой запас — это право не просить.',
    en: {
      текст: '…the officer corps never asked anything for itself personally.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Whoever begs for nothing depends on no one. A reserve of your own is the right not to ask.',
    },
  }),
  Ц({
    id: 'denikin-zhertvennyy-podvig', автор: 'denikin', точно: true,
    текст: 'Ибо при всех своих великих и малых недостатках, офицерство превосходило все другие русские организации, способностью и желанием жертвенного подвига.',
    источник: '«Очерки русской смуты»',
    ситуации: ['honor'],
    кЧему: 'Недостатки есть у всех, важно, на что ты готов ради главного. Отказаться от лишнего сегодня ради свободы завтра — маленький подвиг, доступный каждому.',
    en: {
      текст: 'For with all its great and small shortcomings, the officer corps surpassed all other Russian bodies in its capacity and desire for self-sacrificing deeds.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Everyone has shortcomings; what matters is what you will give for the main thing. Giving up extras today for freedom tomorrow is a small feat open to all.',
    },
  }),
  Ц({
    id: 'denikin-slova-fakty', автор: 'denikin', точно: true,
    текст: 'Слова не могли бороться с фактами, героические поэмы с суровой прозой жизни.',
    источник: '«Очерки русской смуты»',
    ситуации: ['wisdom', 'hard'],
    кЧему: 'Обещания себе «со следующего месяца» не спорят с цифрами в выписке. Смотри на факты — учёт честнее любых слов.',
    en: {
      текст: 'Words could not fight facts, nor heroic poems the harsh prose of life.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Promises to yourself “starting next month” cannot argue with the numbers in a statement. Look at the facts — records are more honest than any words.',
    },
  }),
  Ц({
    id: 'denikin-vera', автор: 'denikin', точно: true,
    текст: 'И теперь, когда дрогнули устои военной мощи, я храню ту же веру. Без нее не стоило бы жить.',
    источник: '«Очерки русской смуты»',
    ситуации: ['support'],
    кЧему: 'Когда рушится привычное — работа, доход, планы, — держись того, во что веришь. Вера даёт силы перестроить и деньги, и жизнь.',
    en: {
      текст: 'Even now, when the foundations of military might have shaken, I keep the same faith. Without it life would not be worth living.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'When the familiar collapses — job, income, plans — hold on to what you believe in. Faith gives the strength to rebuild both your money and your life.',
    },
  }),
  Ц({
    id: 'denikin-nado-rabotat', автор: 'denikin', точно: true,
    текст: 'Тем не менее, надо было работать. А работы всем было более чем достаточно.',
    источник: '«Очерки русской смуты»',
    ситуации: ['work', 'hard'],
    кЧему: 'Как бы ни было тяжело, лучшее лекарство — дело. Работы всегда хватает тому, кто готов её делать.',
    en: {
      текст: 'Nevertheless, one had to work. And there was more than enough work for everyone.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'However hard things are, the best medicine is work. There is always enough of it for those willing to do it.',
    },
  }),
  Ц({
    id: 'denikin-podnyat-duh', автор: 'denikin', точно: true,
    текст: 'Все технические трудности были в конце концов преодолимы. Только бы поднять дух.',
    источник: '«Очерки русской смуты»',
    ситуации: ['goal', 'support'],
    кЧему: 'Как погасить долг или собрать подушку — задача решаемая, есть расчёт и план. Самое трудное — поверить, что получится, и начать.',
    en: {
      текст: 'All the technical difficulties could be overcome in the end. If only the spirit could be raised.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'How to pay off a debt or build a cushion is a solvable problem — there is arithmetic and a plan. The hardest part is believing it will work and starting.',
    },
  }),
  Ц({
    id: 'denikin-beskorystnaya-rabota', автор: 'denikin', точно: true,
    текст: '…весь — в скромной, бескорыстной работе для пользы родной земли.',
    источник: '«Очерки русской смуты»',
    ситуации: ['work', 'honor'],
    кЧему: 'Скромная работа на пользу делу честнее громких обещаний. Деньги приходят к тем, кто приносит пользу, а не к тем, кто громче всех требует.',
    en: {
      текст: '…wholly in modest, selfless work for the good of his native land.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Modest work that does good is more honest than loud promises. Money comes to those who are useful, not to those who demand the loudest.',
    },
  }),
  Ц({
    id: 'denikin-shlyuzy', автор: 'denikin', точно: true,
    текст: 'Никто не создал заблаговременно общего плана каналов и шлюзов для того, чтобы наводнение не превратилось в потоп.',
    источник: '«Очерки русской смуты»',
    ситуации: ['wisdom', 'money'],
    кЧему: 'Подушка безопасности и бюджет — это шлюзы, построенные заранее. Тогда внезапная трата будет лужей, а не потопом.',
    en: {
      текст: 'No one had drawn up in advance a general plan of channels and sluices so that the flood would not turn into a deluge.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'A safety cushion and a budget are sluices built in advance. Then a sudden expense becomes a puddle, not a deluge.',
    },
  }),
  Ц({
    id: 'denikin-ne-pavshie-duhom', автор: 'denikin', точно: true,
    текст: 'Приходили измученные, оборванные, голодные, но не павшие духом.',
    источник: '«Очерки русской смуты»',
    ситуации: ['hard', 'support'],
    кЧему: 'Пустой кошелёк ещё не поражение. Поражение — когда опускаешь руки; пока дух жив, всё можно вернуть.',
    en: {
      текст: 'They came exhausted, ragged, hungry, but not broken in spirit.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'An empty wallet is not yet defeat. Defeat is giving up; while the spirit lives, everything can be won back.',
    },
  }),
  Ц({
    id: 'denikin-shkola', автор: 'denikin', точно: true,
    текст: '…в какой суровой жизненной школе закалялось упорство и твердость первых бойцов ее.',
    источник: '«Очерки русской смуты»',
    ситуации: ['hard'],
    кЧему: 'Трудные годы — суровая школа, но после неё ничто не страшно. Кто научился жить на малом, тот не растеряет и большого.',
    en: {
      текст: '…in what harsh school of life the persistence and firmness of its first fighters were tempered.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Hard years are a harsh school, but after it nothing is frightening. Whoever learned to live on little will not squander much.',
    },
  }),
  Ц({
    id: 'denikin-kak-bratya', автор: 'denikin', точно: true,
    текст: 'Я пришел к вам за помощью. Будем как братья помогать друг другу.',
    источник: '«Очерки русской смуты»',
    ситуации: ['support'],
    кЧему: 'Просить о помощи, когда идёшь к общей цели, не стыдно. Стыдно не отвечать тем же: помогай другим, когда у тебя есть запас.',
    en: {
      текст: 'I have come to you for help. Let us help one another like brothers.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'There is no shame in asking for help on the way to a shared goal. The shame is in not returning it: help others when you have a reserve.',
    },
  }),
  Ц({
    id: 'denikin-bezumcy', автор: 'denikin', точно: true,
    текст: 'Сколько мужества, терпения и веры в свое дело должны были иметь те «безумцы», которые шли в армию, не взирая на все тяжкие условия ее зарождения и существования!',
    источник: '«Очерки русской смуты»',
    ситуации: ['goal'],
    кЧему: 'Того, кто копит и живёт по плану, иногда называют чудаком. Мужество, терпение и вера в своё дело — вот из чего строится свобода.',
    en: {
      текст: 'How much courage, patience and faith in their cause those “madmen” must have had who joined the army despite all the grievous conditions of its birth and existence!',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Someone who saves and lives by a plan is sometimes called an eccentric. Courage, patience and faith in your cause are what freedom is built from.',
    },
  }),
  Ц({
    id: 'denikin-svetoch', автор: 'denikin', точно: true,
    текст: 'Но нужно зажечь светоч, чтобы была хоть одна светлая точка среди охватившей Россию тьмы',
    источник: '«Очерки русской смуты»',
    ситуации: ['goal', 'support'],
    кЧему: 'Даже в самом тёмном месяце можно зажечь светлую точку: первый отложенный рубль, первый закрытый долг. С неё начинается дорога.',
    en: {
      текст: 'But a torch must be lit, so that there is at least one point of light amid the darkness that has engulfed Russia',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Even in the darkest month you can light a point of light: the first rouble saved, the first debt closed. The road begins there.',
    },
  }),
  Ц({
    id: 'denikin-poka-est-zhizn', автор: 'denikin', точно: true,
    текст: 'Пока есть жизнь, пока есть силы, не все потеряно.',
    источник: '«Очерки русской смуты»',
    ситуации: ['support'],
    кЧему: 'Пока ты жив и можешь трудиться, любой финансовый провал поправим. Начни с малого — сегодня.',
    en: {
      текст: 'While there is life, while there is strength, not everything is lost.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'While you are alive and able to work, any financial failure can be repaired. Start small — today.',
    },
  }),
  Ц({
    id: 'denikin-serdcem-veruyu', автор: 'denikin', точно: true,
    текст: 'Умом не постигаю, но сердцем верую, что не погибнет ни идея, ни армия.',
    источник: '«Очерки русской смуты»',
    ситуации: ['support'],
    кЧему: 'Бывает, расчёт не сходится, а сдаваться всё равно нельзя. Вера держит, пока руки делают своё дело.',
    en: {
      текст: 'My mind cannot grasp it, but in my heart I believe that neither the idea nor the army will perish.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Sometimes the sums do not add up and you still must not give in. Faith holds you while your hands do their work.',
    },
  }),
  Ц({
    id: 'denikin-tyazhelaya-nosha', автор: 'denikin', точно: true,
    текст: 'Морально я не имел права уклониться от тяжелой ноши, выпавшей на мою долю в ту минуту, когда армии грозила гибель.',
    источник: '«Очерки русской смуты»',
    ситуации: ['honor', 'hard'],
    кЧему: 'Свои обязательства не перекладывают на других. Взял на себя ношу — неси её честно до конца, и она сделает тебя сильнее.',
    en: {
      текст: 'Morally I had no right to shirk the heavy burden that fell to my lot at the moment when the army faced destruction.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'You do not shift your obligations onto others. If you took on a burden, carry it honestly to the end — and it will make you stronger.',
    },
  }),
  Ц({
    id: 'denikin-stupka', автор: 'denikin', точно: true,
    текст: 'Жизнь толкла нас отчаянно в своей чертовой ступке и не истолкла; закалилось лишь терпение и воля…',
    источник: '«Очерки русской смуты»',
    ситуации: ['hard', 'support'],
    кЧему: 'Трудности не обязательно ломают — чаще закаляют. Каждый пережитый тяжёлый месяц прибавляет терпения и воли для следующего шага.',
    en: {
      текст: 'Life pounded us desperately in its devilish mortar and did not crush us; only our patience and will were tempered…',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Hardship does not necessarily break you — more often it tempers you. Every hard month you get through adds patience and will for the next step.',
    },
  }),
  Ц({
    id: 'denikin-ne-padayte-duhom', автор: 'denikin', точно: true,
    текст: 'Не падайте духом! Только действительно неодолимая сила может остановить нас, а не ожидание возможности встретиться с ней.',
    источник: '«Очерки русской смуты»',
    ситуации: ['support', 'goal'],
    кЧему: 'Страх перед возможной бедой останавливает чаще, чем сама беда. Делай своё — а подушка возьмёт на себя то, что действительно случится.',
    en: {
      текст: 'Do not lose heart! Only a truly insurmountable force can stop us, not the expectation of possibly meeting one.',
      источник: '“Sketches of the Russian Turmoil”',
      кЧему: 'Fear of a possible disaster stops people more often than the disaster itself. Do your part — and let the cushion handle whatever really happens.',
    },
  }),

  // ------------------------------------------------ Менделеев, «Заветные мысли»
  Ц({
    id: 'mendeleev-vyhod', автор: 'mendeleev', точно: true,
    текст: 'С точки зрения реализма нет безысходных понятий подобного рода, везде можно найти свой исторический выход…',
    источник: '«Заветные мысли»',
    ситуации: ['wisdom', 'support'],
    кЧему: 'Безвыходных денежных положений почти не бывает — бывают непосчитанные. Сядь, сведи цифры, и выход найдётся.',
    en: {
      текст: 'From the standpoint of realism there are no hopeless notions of this kind; everywhere one can find one’s own historical way out…',
      источник: '“Cherished Thoughts”',
      кЧему: 'There are almost no hopeless money situations — only uncounted ones. Sit down, add up the numbers, and a way out will appear.',
    },
  }),
  Ц({
    id: 'mendeleev-neuspeh', автор: 'mendeleev', точно: true,
    текст: 'Мне предрекали великий неуспех, тщету усилий, но меня это не смущало, а, напротив того, только возбуждало.',
    источник: '«Заветные мысли»',
    ситуации: ['goal'],
    кЧему: 'Кто начинает копить или гасить долг, обязательно услышит «ничего не выйдет». Пусть это только подзадоривает тебя.',
    en: {
      текст: 'They foretold a great failure, the futility of my efforts, but that did not trouble me; on the contrary, it only spurred me on.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Anyone who starts saving or paying off debt will hear “it won’t work”. Let that only spur you on.',
    },
  }),
  Ц({
    id: 'mendeleev-vse-trudu', автор: 'mendeleev', точно: true,
    текст: '„Все — труду людскому!“ — это лозунг всей истории…',
    источник: '«Заветные мысли»',
    ситуации: ['work'],
    кЧему: 'Всё, что у тебя есть и будет, создано трудом — твоим или чужим. Уважай свой труд: не отдавай его плоды за пустяки.',
    en: {
      текст: '“Everything to human labour!” — that is the motto of all history…',
      источник: '“Cherished Thoughts”',
      кЧему: 'Everything you have and will have was created by labour — yours or someone else’s. Respect your labour: do not trade its fruits for trifles.',
    },
  }),
  Ц({
    id: 'mendeleev-kolichestvo-truda', автор: 'mendeleev', точно: true,
    текст: '…прогресс и всякие виды даже не вещественного богатства определяются количеством и качеством затрачиваемого труда.',
    источник: '«Заветные мысли»',
    ситуации: ['work'],
    кЧему: 'Богатство — не удача, а сумма и качество вложенного труда. Учись работать лучше — это самое надёжное вложение.',
    en: {
      текст: '…progress and every kind of wealth, even non-material, is determined by the quantity and quality of the labour expended.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Wealth is not luck but the sum and quality of labour invested. Learn to work better — it is the most reliable investment.',
    },
  }),
  Ц({
    id: 'mendeleev-sberezhenie', автор: 'mendeleev', точно: true,
    текст: 'В этом должно видеть мировую справедливость, потому что сбережение не есть порок, а добродетель.',
    источник: '«Заветные мысли»',
    ситуации: ['money', 'honor'],
    кЧему: 'Копить — не жадность и не стыд, а добродетель: так ты бережёшь свой труд и свою независимость. Сбережённое — это свобода про запас.',
    en: {
      текст: 'In this one should see a world justice, because saving is not a vice but a virtue.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Saving is neither greed nor shame but a virtue: it is how you guard your labour and your independence. What you save is freedom held in reserve.',
    },
  }),
  Ц({
    id: 'mendeleev-tolko-trudu', автор: 'mendeleev', точно: true,
    текст: 'Сотни раз надо повторять и всегда помнить, что все дается — только труду.',
    источник: '«Заветные мысли»',
    ситуации: ['work', 'hard'],
    кЧему: 'Лёгких денег не бывает: лотереи, «быстрые схемы» и кредиты на мечту обходятся дороже всего. Всё настоящее даётся только труду.',
    en: {
      текст: 'One must repeat it hundreds of times and always remember that everything is given only to labour.',
      источник: '“Cherished Thoughts”',
      кЧему: 'There is no easy money: lotteries, “quick schemes” and loans for dreams cost the most of all. Everything real is given only to labour.',
    },
  }),
  Ц({
    id: 'mendeleev-svoystvo-kapitala', автор: 'mendeleev', точно: true,
    текст: 'Уж таково свойство капитала: если он тратится на производительный труд, то сам родит богатство, увеличивает спрос и оживляет всю деятельность страны.',
    источник: '«Заветные мысли»',
    ситуации: ['money', 'goal'],
    кЧему: 'Деньги, вложенные в дело, рождают новые; деньги, проеденные впустую, исчезают. Отличай траты от вложений — и капитал начнёт работать на тебя.',
    en: {
      текст: 'Such is the property of capital: if it is spent on productive labour, it gives birth to wealth itself, increases demand and enlivens all the activity of the country.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Money put into productive work gives birth to more; money frittered away disappears. Tell spending from investing, and capital starts working for you.',
    },
  }),
  Ц({
    id: 'mendeleev-bodrym-shagom', автор: 'mendeleev', точно: true,
    текст: '…чтобы жизнь шла не черепашьим шагом, а скорым, современным, бодрым.',
    источник: '«Заветные мысли»',
    ситуации: ['goal'],
    кЧему: 'Не откладывай жизнь «на потом»: план и запас позволяют двигаться бодро, а не ползти от зарплаты к зарплате.',
    en: {
      текст: '…so that life moves not at a tortoise’s pace but at a quick, modern, brisk one.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Do not postpone life “until later”: a plan and a reserve let you move briskly instead of crawling from payday to payday.',
    },
  }),
  Ц({
    id: 'mendeleev-mudrost', автор: 'mendeleev', точно: true,
    текст: '…только пройдя все усложняющийся круг готовой человеческой мудрости, без чего нельзя плодотворно прожить.',
    источник: '«Заветные мысли»',
    ситуации: ['wisdom'],
    кЧему: 'Не изобретай всё сам: люди давно знают, как беречь деньги и не попадать в кабалу. Учись у мудрости, накопленной до тебя.',
    en: {
      текст: '…only by passing through the ever more complex circle of ready human wisdom, without which one cannot live fruitfully.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Do not invent everything yourself: people have long known how to keep money and avoid bondage. Learn from the wisdom gathered before you.',
    },
  }),
  Ц({
    id: 'mendeleev-trudolyubie-zhizn', автор: 'mendeleev', точно: true,
    текст: '…равное настойчивое трудолюбие, составляющее один из плодов всей цивилизации, возвышает продолжительность жизни…',
    источник: '«Заветные мысли»',
    ситуации: ['work'],
    кЧему: 'Настойчивый труд не только кормит, но и держит человека живым и бодрым. Ровный ритм лучше рывков — и в работе, и в сбережениях.',
    en: {
      текст: '…steady, persistent industriousness, one of the fruits of all civilisation, lengthens life…',
      источник: '“Cherished Thoughts”',
      кЧему: 'Persistent work not only feeds a person but keeps him alive and vigorous. A steady rhythm beats spurts — in work and in saving.',
    },
  }),
  Ц({
    id: 'mendeleev-osnova-sobstvennosti', автор: 'mendeleev', точно: true,
    текст: 'Труд же личный вместе с наследством составляет основу собственности, признание которой, без сомнения, составляет начало всей гражданственности.',
    источник: '«Заветные мысли»',
    ситуации: ['money', 'work'],
    кЧему: 'Собственность, нажитая своим трудом, — основа достоинства гражданина. Береги нажитое и передай детям больше, чем получил сам.',
    en: {
      текст: 'Personal labour together with inheritance forms the basis of property, the recognition of which undoubtedly constitutes the beginning of all citizenship.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Property earned by your own labour is the foundation of a citizen’s dignity. Guard what you have earned and pass on to your children more than you received.',
    },
  }),
  Ц({
    id: 'mendeleev-ravenstvo', автор: 'mendeleev', точно: true,
    текст: 'Равенство нужно, равенство составляет необходимость всякого успеха, но оно должно касаться прежде всего прав на плоды трудов, а не бороться с их источниками.',
    источник: '«Заветные мысли»',
    ситуации: ['work', 'wisdom'],
    кЧему: 'Справедливо, когда каждый владеет плодами своего труда. Не завидуй чужому достатку — строй свой.',
    en: {
      текст: 'Equality is needed, equality is a necessity for any success, but it must concern above all the rights to the fruits of labour, not fight against their sources.',
      источник: '“Cherished Thoughts”',
      кЧему: 'It is just when everyone owns the fruits of his own labour. Do not envy another’s prosperity — build your own.',
    },
  }),
  Ц({
    id: 'mendeleev-potrebnosti', автор: 'mendeleev', точно: true,
    текст: 'Увеличение же потребностей вместе с развитием средств для их удовлетворения неизбежно ведет к необходимости увеличить труд.',
    источник: '«Заветные мысли»',
    ситуации: ['work', 'money'],
    кЧему: 'Каждая новая привычка в тратах — это новые часы работы. Прежде чем увеличить потребности, спроси себя, сколько труда они будут стоить.',
    en: {
      текст: 'The growth of needs, together with the development of the means to satisfy them, inevitably leads to the need to increase labour.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Every new spending habit means new hours of work. Before raising your needs, ask yourself how much labour they will cost.',
    },
  }),
  Ц({
    id: 'mendeleev-izbytki', автор: 'mendeleev', точно: true,
    текст: 'Если же труд возрастает, потребности растут еще не так быстро, откуда и являются избытки, т.е. капиталы.',
    источник: '«Заветные мысли»',
    ситуации: ['money', 'goal'],
    кЧему: 'Вот вся формула богатства: зарабатывай больше, а траты пусть растут медленнее. Разница и есть твой капитал и твоя свобода.',
    en: {
      текст: 'If labour grows while needs grow less quickly, surpluses appear, that is, capital.',
      источник: '“Cherished Thoughts”',
      кЧему: 'That is the whole formula of wealth: earn more and let spending grow more slowly. The difference is your capital and your freedom.',
    },
  }),
  Ц({
    id: 'mendeleev-blago-narodnoe', автор: 'mendeleev', точно: true,
    текст: '…для „блага народного“ прежде и важнее всего заботиться об умножении современной ценности всего производства страны.',
    источник: '«Заветные мысли»',
    ситуации: ['money', 'work'],
    кЧему: 'Благо начинается не с раздела, а с умножения. В своём хозяйстве тоже: думай, как заработать и создать больше, а не только как урезать.',
    en: {
      текст: '…for the “good of the people” it is first and most important to care for multiplying the present value of the country’s entire production.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Prosperity begins not with dividing but with multiplying. In your own household too: think how to earn and create more, not only how to cut.',
    },
  }),
  Ц({
    id: 'mendeleev-snachala-materialnye', автор: 'mendeleev', точно: true,
    текст: 'Духовные потребности и духовные отношения могут выступать, очевидно, только после удовлетворения материальных, и уже по этому одному проще, ближе и реальнее начинать с этих последних.',
    источник: '«Заветные мысли»',
    ситуации: ['wisdom', 'money'],
    кЧему: 'Порядок в деньгах освобождает голову для главного. Начни с простого и реального — с учёта и подушки, — и на высокое останутся силы.',
    en: {
      текст: 'Spiritual needs and spiritual relations can evidently come forward only after material ones are satisfied, and for this reason alone it is simpler, nearer and more realistic to begin with the latter.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Order in money frees your head for what matters. Start with the simple and real — records and a cushion — and you will have strength left for higher things.',
    },
  }),
  Ц({
    id: 'mendeleev-izmenchivost', автор: 'mendeleev', точно: true,
    текст: '…надобны же изменчивость жизни и роста и приноровление к изменяющейся обстановке.',
    источник: '«Заветные мысли»',
    ситуации: ['wisdom'],
    кЧему: 'Бюджет, составленный раз и навсегда, не работает: жизнь меняется. Пересматривай план и подстраивайся — так деньги остаются у тебя в подчинении.',
    en: {
      текст: '…what is needed is the changeability of life and growth, and adaptation to changing circumstances.',
      источник: '“Cherished Thoughts”',
      кЧему: 'A budget drawn up once and for all does not work: life changes. Review the plan and adapt — that is how money stays under your command.',
    },
  }),
  Ц({
    id: 'mendeleev-smelost', автор: 'mendeleev', точно: true,
    текст: '…своя смелость и своя настойчивость, которые нельзя же оставить без соответственного вознаграждения.',
    источник: '«Заветные мысли»',
    ситуации: ['work', 'goal'],
    кЧему: 'Смелость и настойчивость тоже труд, и они достойны платы. Не стесняйся просить справедливую цену за свою работу.',
    en: {
      текст: '…one’s own boldness and one’s own persistence, which surely cannot be left without fitting reward.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Boldness and persistence are labour too, and they deserve payment. Do not be shy about asking a fair price for your work.',
    },
  }),
  Ц({
    id: 'mendeleev-oborotnyy-kapital', автор: 'mendeleev', точно: true,
    текст: 'Мой жизненный опыт внушает мне мысль, что многие из не удающихся у нас промышленных предприятий оттого и бедствуют, даже часто банкротятся, что при своем устройстве неправильно соразмеряют величину необходимого оборотного капитала…',
    источник: '«Заветные мысли»',
    ситуации: ['money', 'wisdom'],
    кЧему: 'Дома то же, что в деле: банкротят не малые доходы, а отсутствие запаса на текущие расходы. Держи «оборотный капитал» — подушку на месяцы вперёд.',
    en: {
      текст: 'My experience of life suggests to me that many of our unsuccessful industrial enterprises struggle, and often even go bankrupt, because in setting up they misjudge the size of the working capital they need…',
      источник: '“Cherished Thoughts”',
      кЧему: 'At home it is the same as in business: it is not small income that bankrupts you but having no reserve for running costs. Keep “working capital” — a cushion for months ahead.',
    },
  }),
  Ц({
    id: 'mendeleev-istochnik-bogatstva', автор: 'mendeleev', точно: true,
    текст: '…труд есть единственный источник богатства народов, а следовательно, и „народного благосостояния“.',
    источник: '«Заветные мысли»',
    ситуации: ['work'],
    кЧему: 'Не ищи богатства в обход труда — там только долги и разочарования. Свой труд, умноженный бережливостью, и есть твоё благосостояние.',
    en: {
      текст: '…labour is the only source of the wealth of nations, and consequently of “national well-being”.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Do not look for wealth that bypasses labour — there are only debts and disappointment there. Your labour, multiplied by thrift, is your well-being.',
    },
  }),
  Ц({
    id: 'mendeleev-ostatki-truda', автор: 'mendeleev', точно: true,
    текст: 'Совсем иными качествами обладает капитал, или остатки труда народного, сбереженные от потребления или в него еще не вошедшие и способные при развитии трудолюбия у народонаселения беспредельно возрастать.',
    источник: '«Заветные мысли»',
    ситуации: ['money'],
    кЧему: 'Капитал — это твой труд, сбережённый от проедания. Каждая отложенная сумма способна расти, если не дать ей уйти в потребление.',
    en: {
      текст: 'Capital has quite different qualities — the remains of the people’s labour, saved from consumption or not yet consumed, and able to grow without limit as the population’s industriousness develops.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Capital is your labour saved from being eaten up. Every sum you set aside can grow if you do not let it slip into consumption.',
    },
  }),
  Ц({
    id: 'mendeleev-pobogatel', автор: 'mendeleev', точно: true,
    текст: 'Затем самое главное и важнейшее, на мой взгляд, решить, победнел ли или нет, или же побогател русский народ в целом своем составе…',
    источник: '«Заветные мысли»',
    ситуации: ['money', 'wisdom'],
    кЧему: 'Главный вопрос и для семьи: стали мы за год богаче или беднее? Чистый капитал в Кошеле отвечает на него честно — смотри на него регулярно.',
    en: {
      текст: 'Then the main and most important thing, in my view, is to determine whether the Russian people as a whole has grown poorer or not, or has grown richer…',
      источник: '“Cherished Thoughts”',
      кЧему: 'It is the main question for a family too: did we get richer or poorer this year? The net worth in Koshel answers it honestly — look at it regularly.',
    },
  }),
  Ц({
    id: 'mendeleev-umnozhil', автор: 'mendeleev', точно: true,
    текст: '…чтобы русский народ, включая в него, конечно, и всю интеллигенцию страны, свое трудолюбие умножил для разработки природных запасов богатой своей страны…',
    источник: '«Заветные мысли»',
    ситуации: ['work', 'goal'],
    кЧему: 'Мы живём в богатой стране — богатство ждёт приложения труда и ума. Умножь трудолюбие, и твоя доля этого богатства станет твоей.',
    en: {
      текст: '…that the Russian people, including of course the whole intelligentsia of the country, multiply their industriousness to develop the natural resources of their rich country…',
      источник: '“Cherished Thoughts”',
      кЧему: 'We live in a rich country — its wealth waits for labour and wits to be applied. Multiply your industriousness, and your share of that wealth becomes yours.',
    },
  }),
  Ц({
    id: 'mendeleev-svoboda-dlya-truda', автор: 'mendeleev', точно: true,
    текст: 'Свобода для труда (а не от труда) составляет великое благо.',
    источник: '«Заветные мысли»',
    ситуации: ['work', 'goal', 'honor'],
    кЧему: 'Свобода, которую дают деньги, — не право бездельничать, а право выбирать своё дело. Копи, чтобы трудиться над тем, что считаешь важным.',
    en: {
      текст: 'Freedom for labour (and not from labour) is a great good.',
      источник: '“Cherished Thoughts”',
      кЧему: 'The freedom money gives is not the right to idle but the right to choose your work. Save so you can labour at what you think important.',
    },
  }),
  Ц({
    id: 'mendeleev-sovershenstvo', автор: 'mendeleev', точно: true,
    текст: 'В делах людских абсолютное совершенство обеспечить невозможно, но приближаться к нему должно постепенно',
    источник: '«Заветные мысли»',
    ситуации: ['wisdom', 'support'],
    кЧему: 'Идеальный бюджет не нужен — нужен чуть лучше прошлого месяца. Постепенное движение надёжнее рывков к совершенству.',
    en: {
      текст: 'In human affairs absolute perfection cannot be ensured, but one should approach it gradually',
      источник: '“Cherished Thoughts”',
      кЧему: 'You do not need a perfect budget — just a slightly better one than last month. Gradual progress is more reliable than leaps towards perfection.',
    },
  }),
  Ц({
    id: 'mendeleev-somneniya', автор: 'mendeleev', точно: true,
    текст: '…за науку настоящую считайте только то, что утвердилось после сомнений и всякого рода испытаний…',
    источник: '«Заветные мысли»',
    ситуации: ['wisdom'],
    кЧему: 'Не верь советам о «верном доходе» на слово. Проверяй цифрами и временем — так берегут и деньги, и свободу.',
    en: {
      текст: '…count as true science only what has been established after doubts and every kind of trial…',
      источник: '“Cherished Thoughts”',
      кЧему: 'Do not take advice about a “sure income” on trust. Check it with numbers and time — that is how both money and freedom are kept.',
    },
  }),
  Ц({
    id: 'mendeleev-otvetim-na-svobodu', автор: 'mendeleev', точно: true,
    текст: 'Ответим на свободу усиленными трудами и твердостью воли, направленными разумно на благо Родины.',
    источник: '«Заветные мысли»',
    ситуации: ['work', 'goal', 'honor'],
    кЧему: 'Свобода — не подарок, а ответственность. Отвечай на неё трудом и твёрдой волей — тогда деньги будут служить и тебе, и делу.',
    en: {
      текст: 'Let us answer freedom with redoubled labour and firmness of will, directed wisely to the good of the Motherland.',
      источник: '“Cherished Thoughts”',
      кЧему: 'Freedom is not a gift but a responsibility. Answer it with labour and firm will — then money will serve both you and your cause.',
    },
  }),
]
