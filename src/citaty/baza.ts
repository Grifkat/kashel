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
]
