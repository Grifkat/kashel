/*
 * Авторы цитат.
 *
 * Автор заводится один раз, цитаты ссылаются на него по id. Имя, годы и
 * «чем прославился» — одна строка, её видно под портретом. Портрет лежит в
 * citaty/portrety под тем же id (см. portrety.ts и ISTOCHNIKI.md); нет
 * свободного портрета — рисуется монограмма.
 *
 * Этот файл — данные: русский текст здесь не идёт через т(), перевод лежит
 * рядом, в поле en. Сторож перевода файл не проверяет.
 */

export interface Автор {
  id: string
  имя: string
  /** «1821–1881»; для народной мудрости — откуда она. */
  годы: string
  /** Чем прославился — одна строка. */
  слава: string
  /** Чей портрет показывать, если не свой (народная мудрость — Даль). */
  портрет?: string
  en?: { имя?: string; годы?: string; слава?: string }
}

const А = (a: Автор): Автор => a

export const АВТОРЫ: Автор[] = [
  А({ id: 'nevsky', имя: 'Александр Невский', годы: '1221–1263',
    слава: 'Князь, разбил шведов на Неве и рыцарей на Чудском озере; святой, символ защиты Родины.',
    en: { имя: 'Alexander Nevsky', слава: 'Prince who beat the Swedes on the Neva and the knights on Lake Peipus; a saint and a symbol of defending the homeland.' } }),
  А({ id: 'monomah', имя: 'Владимир Мономах', годы: '1053–1125',
    слава: 'Великий князь Киевский; его «Поучение детям» — первое русское наставление о жизни и труде.',
    en: { имя: 'Vladimir Monomakh', слава: 'Grand Prince of Kiev; his “Instruction to his children” is the first Russian guide to life and work.' } }),
  А({ id: 'minin', имя: 'Кузьма Минин', годы: '?–1616',
    слава: 'Нижегородский староста, собрал деньги и ополчение, освободившее Москву в 1612 году.',
    en: { имя: 'Kuzma Minin', слава: 'Nizhny Novgorod merchant elder who raised the money and the militia that freed Moscow in 1612.' } }),
  А({ id: 'petr1', имя: 'Пётр I', годы: '1672–1725',
    слава: 'Первый император: флот, армия, Петербург; повернул Россию к науке и промышленности.',
    en: { имя: 'Peter the Great', слава: 'First Russian emperor: navy, army, St Petersburg; turned Russia towards science and industry.' } }),
  А({ id: 'lomonosov', имя: 'Михаил Ломоносов', годы: '1711–1765',
    слава: 'Первый русский учёный мирового уровня; сын рыбака, пешком пришёл в Москву учиться.',
    en: { имя: 'Mikhail Lomonosov', слава: 'First Russian scientist of world rank; a fisherman’s son who walked to Moscow to study.' } }),
  А({ id: 'suvorov', имя: 'Александр Суворов', годы: '1730–1800',
    слава: 'Генералиссимус, не проиграл ни одного сражения; автор «Науки побеждать».',
    en: { имя: 'Alexander Suvorov', слава: 'Generalissimo who never lost a battle; author of “The Science of Victory”.' } }),
  А({ id: 'derzhavin', имя: 'Гавриил Державин', годы: '1743–1816',
    слава: 'Первый великий русский поэт и министр юстиции; благословил юного Пушкина.',
    en: { имя: 'Gavrila Derzhavin', слава: 'The first great Russian poet and a minister of justice; gave his blessing to the young Pushkin.' } }),
  А({ id: 'krylov', имя: 'Иван Крылов', годы: '1769–1844',
    слава: 'Баснописец; его строки стали пословицами, а басни — школой здравого смысла.',
    en: { имя: 'Ivan Krylov', слава: 'Fabulist whose lines became proverbs and whose fables became a school of common sense.' } }),
  А({ id: 'zhukovsky', имя: 'Василий Жуковский', годы: '1783–1852',
    слава: 'Поэт, учитель Пушкина и наставник Александра II, царя-освободителя.',
    en: { имя: 'Vasily Zhukovsky', слава: 'Poet, Pushkin’s teacher and tutor to Alexander II, the Tsar Liberator.' } }),
  А({ id: 'griboedov', имя: 'Александр Грибоедов', годы: '1795–1829',
    слава: 'Драматург и дипломат; «Горе от ума» разошлось на поговорки ещё при жизни автора.',
    en: { имя: 'Alexander Griboyedov', слава: 'Playwright and diplomat; “Woe from Wit” turned into proverbs within his lifetime.' } }),
  А({ id: 'pushkin', имя: 'Александр Пушкин', годы: '1799–1837',
    слава: 'Создатель современного русского литературного языка, «наше всё».',
    en: { имя: 'Alexander Pushkin', слава: 'Creator of modern literary Russian — “our everything”.' } }),
  А({ id: 'tyutchev', имя: 'Фёдор Тютчев', годы: '1803–1873',
    слава: 'Поэт и дипломат, мастер философской лирики.',
    en: { имя: 'Fyodor Tyutchev', слава: 'Poet and diplomat, master of philosophical lyric verse.' } }),
  А({ id: 'gogol', имя: 'Николай Гоголь', годы: '1809–1852',
    слава: '«Мёртвые души» и «Ревизор»: показал обществу его пороки, смеясь.',
    en: { имя: 'Nikolai Gogol', слава: '“Dead Souls” and “The Government Inspector”: showed society its vices while making it laugh.' } }),
  А({ id: 'lermontov', имя: 'Михаил Лермонтов', годы: '1814–1841',
    слава: 'Поэт и офицер; «Герой нашего времени» — первый русский психологический роман.',
    en: { имя: 'Mikhail Lermontov', слава: 'Poet and officer; “A Hero of Our Time” is the first Russian psychological novel.' } }),
  А({ id: 'turgenev', имя: 'Иван Тургенев', годы: '1818–1883',
    слава: 'Писатель; «Записки охотника» помогли подготовить отмену крепостного права.',
    en: { имя: 'Ivan Turgenev', слава: 'Writer whose “A Sportsman’s Sketches” helped prepare the abolition of serfdom.' } }),
  А({ id: 'dostoevsky', имя: 'Фёдор Достоевский', годы: '1821–1881',
    слава: 'Писатель мирового масштаба, исследователь души; прошёл каторгу и вернулся в литературу.',
    en: { имя: 'Fyodor Dostoevsky', слава: 'World-class novelist and explorer of the soul; survived penal servitude and came back to literature.' } }),
  А({ id: 'nekrasov', имя: 'Николай Некрасов', годы: '1821–1878',
    слава: 'Поэт и издатель «Современника», голос крестьянской России.',
    en: { имя: 'Nikolai Nekrasov', слава: 'Poet and publisher of “The Contemporary”, the voice of peasant Russia.' } }),
  А({ id: 'prutkov', имя: 'Козьма Прутков', годы: '1850–1860-е',
    слава: 'Общий псевдоним А. К. Толстого и братьев Жемчужниковых; афоризмы цитируют полтора века.',
    en: { имя: 'Kozma Prutkov', годы: '1850s–1860s', слава: 'Joint pen name of A. K. Tolstoy and the Zhemchuzhnikov brothers; quoted for a century and a half.' } }),
  А({ id: 'tolstoy', имя: 'Лев Толстой', годы: '1828–1910',
    слава: 'Автор «Войны и мира» и «Анны Карениной», один из величайших писателей мира.',
    en: { имя: 'Leo Tolstoy', слава: 'Author of “War and Peace” and “Anna Karenina”, one of the world’s greatest writers.' } }),
  А({ id: 'klyuchevsky', имя: 'Василий Ключевский', годы: '1841–1911',
    слава: 'Историк, автор «Курса русской истории».',
    en: { имя: 'Vasily Klyuchevsky', слава: 'Historian, author of “A Course of Russian History”.' } }),
  А({ id: 'pavlov', имя: 'Иван Павлов', годы: '1849–1936',
    слава: 'Физиолог, первый русский нобелевский лауреат (1904).',
    en: { имя: 'Ivan Pavlov', слава: 'Physiologist, the first Russian Nobel laureate (1904).' } }),
  А({ id: 'chekhov', имя: 'Антон Чехов', годы: '1860–1904',
    слава: 'Писатель и врач, мастер рассказа, драматург «Вишнёвого сада».',
    en: { имя: 'Anton Chekhov', слава: 'Writer and doctor, master of the short story, author of “The Cherry Orchard”.' } }),
  А({ id: 'stolypin', имя: 'Пётр Столыпин', годы: '1862–1911',
    слава: 'Премьер-министр, автор аграрной реформы: дал крестьянам землю в собственность.',
    en: { имя: 'Pyotr Stolypin', слава: 'Prime minister whose land reform gave peasants land of their own.' } }),
  А({ id: 'tsiolkovsky', имя: 'Константин Циолковский', годы: '1857–1935',
    слава: 'Основоположник космонавтики; учитель из Калуги, рассчитавший полёт ракеты.',
    en: { имя: 'Konstantin Tsiolkovsky', слава: 'Father of space flight; a Kaluga schoolteacher who worked out how a rocket reaches space.' } }),
  А({ id: 'bulgakov', имя: 'Михаил Булгаков', годы: '1891–1940',
    слава: 'Писатель, «Мастер и Маргарита» и «Собачье сердце».',
    en: { имя: 'Mikhail Bulgakov', слава: 'Writer of “The Master and Margarita” and “Heart of a Dog”.' } }),
  А({ id: 'esenin', имя: 'Сергей Есенин', годы: '1895–1925',
    слава: 'Поэт русской деревни и природы, один из самых любимых в народе.',
    en: { имя: 'Sergei Yesenin', слава: 'Poet of the Russian village and countryside, among the most loved by the people.' } }),
  А({ id: 'gagarin', имя: 'Юрий Гагарин', годы: '1934–1968',
    слава: 'Первый человек в космосе, 12 апреля 1961 года.',
    en: { имя: 'Yuri Gagarin', слава: 'The first human in space, 12 April 1961.' } }),
  А({ id: 'narod', имя: 'Народная мудрость', годы: 'из собрания В. И. Даля', портрет: 'dal',
    слава: 'Пословицы из собрания Владимира Даля — врача, моряка и лексикографа, записавшего больше 30 000 пословиц.',
    en: { имя: 'Folk wisdom', годы: 'collected by Vladimir Dal', слава: 'Proverbs collected by Vladimir Dal — doctor, sailor and lexicographer who wrote down more than 30,000 of them.' } }),
]
