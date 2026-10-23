/*
 * Авторы цитат.
 *
 * Автор заводится один раз, цитаты ссылаются на него по id. Имя, годы и
 * «чем прославился» — одна строка, её видно под портретом. Портрет лежит в
 * citaty/portrety под тем же id (см. portrety.ts и ISTOCHNIKI.md); нет
 * свободного портрета — рисуется монограмма.
 *
 * Каждая строка «чем прославился» прямо говорит: русский и великий. В этом
 * посыл библиотеки: предки читателя были великими — значит, и он может.
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
    слава: 'Великий русский князь и полководец: разбил шведов на Неве и рыцарей на Чудском озере. Святой, вечный символ защиты Родины.',
    en: { имя: 'Alexander Nevsky', слава: 'Great Russian prince and commander who beat the Swedes on the Neva and the knights on Lake Peipus. A saint and an everlasting symbol of defending the homeland.' } }),
  А({ id: 'monomah', имя: 'Владимир Мономах', годы: '1053–1125',
    слава: 'Великий русский князь, собиратель Руси; его «Поучение детям» — первое русское наставление о жизни и труде.',
    en: { имя: 'Vladimir Monomakh', слава: 'Great Russian prince who held Rus together; his “Instruction to his children” is the first Russian guide to life and work.' } }),
  А({ id: 'minin', имя: 'Кузьма Минин', годы: '?–1616',
    слава: 'Русский народный герой: нижегородский староста собрал деньги и ополчение, освободившее Москву в 1612 году.',
    en: { имя: 'Kuzma Minin', слава: 'Russian national hero: the Nizhny Novgorod elder who raised the money and the militia that freed Moscow in 1612.' } }),
  А({ id: 'petr1', имя: 'Пётр I', годы: '1672–1725',
    слава: 'Великий русский царь и первый император: создал флот и армию, построил Петербург и сделал Россию великой державой.',
    en: { имя: 'Peter the Great', слава: 'Great Russian tsar and first emperor: built the navy, the army and St Petersburg, and made Russia a great power.' } }),
  А({ id: 'lomonosov', имя: 'Михаил Ломоносов', годы: '1711–1765',
    слава: 'Великий русский учёный, основатель Московского университета; сын рыбака, пешком пришёл в Москву учиться.',
    en: { имя: 'Mikhail Lomonosov', слава: 'Great Russian scientist and founder of Moscow University; a fisherman’s son who walked to Moscow to study.' } }),
  А({ id: 'suvorov', имя: 'Александр Суворов', годы: '1730–1800',
    слава: 'Великий русский полководец, генералиссимус, не проигравший ни одного сражения; автор «Науки побеждать».',
    en: { имя: 'Alexander Suvorov', слава: 'Great Russian commander, a generalissimo who never lost a battle; author of “The Science of Victory”.' } }),
  А({ id: 'derzhavin', имя: 'Гавриил Державин', годы: '1743–1816',
    слава: 'Первый великий русский поэт и государственный деятель; благословил юного Пушкина.',
    en: { имя: 'Gavrila Derzhavin', слава: 'The first great Russian poet and a statesman; gave his blessing to the young Pushkin.' } }),
  А({ id: 'krylov', имя: 'Иван Крылов', годы: '1769–1844',
    слава: 'Великий русский баснописец: его строки стали пословицами, а басни — школой здравого смысла для всей страны.',
    en: { имя: 'Ivan Krylov', слава: 'Great Russian fabulist whose lines became proverbs and whose fables became a school of common sense for the whole country.' } }),
  А({ id: 'zhukovsky', имя: 'Василий Жуковский', годы: '1783–1852',
    слава: 'Великий русский поэт, учитель Пушкина и наставник Александра II, царя-освободителя.',
    en: { имя: 'Vasily Zhukovsky', слава: 'Great Russian poet, Pushkin’s teacher and tutor to Alexander II, the Tsar Liberator.' } }),
  А({ id: 'griboedov', имя: 'Александр Грибоедов', годы: '1795–1829',
    слава: 'Русский драматург и дипломат; его «Горе от ума» — великая русская комедия, разошедшаяся на поговорки ещё при жизни автора.',
    en: { имя: 'Alexander Griboyedov', слава: 'Russian playwright and diplomat; his “Woe from Wit” is a great Russian comedy that turned into proverbs within his lifetime.' } }),
  А({ id: 'pushkin', имя: 'Александр Пушкин', годы: '1799–1837',
    слава: 'Величайший русский поэт, создатель современного русского литературного языка — «наше всё».',
    en: { имя: 'Alexander Pushkin', слава: 'The greatest Russian poet, creator of modern literary Russian — “our everything”.' } }),
  А({ id: 'tyutchev', имя: 'Фёдор Тютчев', годы: '1803–1873',
    слава: 'Великий русский поэт и дипломат, мастер философской лирики.',
    en: { имя: 'Fyodor Tyutchev', слава: 'Great Russian poet and diplomat, master of philosophical lyric verse.' } }),
  А({ id: 'gogol', имя: 'Николай Гоголь', годы: '1809–1852',
    слава: 'Великий русский писатель: «Мёртвые души» и «Ревизор» вошли в классику мировой литературы.',
    en: { имя: 'Nikolai Gogol', слава: 'Great Russian writer: “Dead Souls” and “The Government Inspector” are classics of world literature.' } }),
  А({ id: 'lermontov', имя: 'Михаил Лермонтов', годы: '1814–1841',
    слава: 'Великий русский поэт и офицер; «Герой нашего времени» — первый русский психологический роман.',
    en: { имя: 'Mikhail Lermontov', слава: 'Great Russian poet and officer; “A Hero of Our Time” is the first Russian psychological novel.' } }),
  А({ id: 'turgenev', имя: 'Иван Тургенев', годы: '1818–1883',
    слава: 'Великий русский писатель, которого читала вся Европа; «Записки охотника» помогли подготовить отмену крепостного права.',
    en: { имя: 'Ivan Turgenev', слава: 'Great Russian writer read all over Europe; his “A Sportsman’s Sketches” helped prepare the abolition of serfdom.' } }),
  А({ id: 'dostoevsky', имя: 'Фёдор Достоевский', годы: '1821–1881',
    слава: 'Великий русский писатель, один из величайших в мире; прошёл каторгу и вернулся, чтобы писать о русской душе.',
    en: { имя: 'Fyodor Dostoevsky', слава: 'Great Russian writer, one of the greatest in the world; survived penal servitude and came back to write about the Russian soul.' } }),
  А({ id: 'nekrasov', имя: 'Николай Некрасов', годы: '1821–1878',
    слава: 'Великий русский поэт и издатель «Современника», голос крестьянской России.',
    en: { имя: 'Nikolai Nekrasov', слава: 'Great Russian poet and publisher of “The Contemporary”, the voice of peasant Russia.' } }),
  А({ id: 'prutkov', имя: 'Козьма Прутков', годы: '1850–1860-е',
    слава: 'Общий псевдоним русских поэтов А. К. Толстого и братьев Жемчужниковых; их афоризмы цитируют полтора века.',
    en: { имя: 'Kozma Prutkov', годы: '1850s–1860s', слава: 'Joint pen name of the Russian poets A. K. Tolstoy and the Zhemchuzhnikov brothers; quoted for a century and a half.' } }),
  А({ id: 'tolstoy', имя: 'Лев Толстой', годы: '1828–1910',
    слава: 'Великий русский писатель, один из величайших в мире: автор «Войны и мира» и «Анны Карениной».',
    en: { имя: 'Leo Tolstoy', слава: 'Great Russian writer, one of the greatest in the world: author of “War and Peace” and “Anna Karenina”.' } }),
  А({ id: 'klyuchevsky', имя: 'Василий Ключевский', годы: '1841–1911',
    слава: 'Великий русский историк, автор «Курса русской истории».',
    en: { имя: 'Vasily Klyuchevsky', слава: 'Great Russian historian, author of “A Course of Russian History”.' } }),
  А({ id: 'pavlov', имя: 'Иван Павлов', годы: '1849–1936',
    слава: 'Великий русский учёный-физиолог, первый русский нобелевский лауреат (1904).',
    en: { имя: 'Ivan Pavlov', слава: 'Great Russian physiologist, the first Russian Nobel laureate (1904).' } }),
  А({ id: 'chekhov', имя: 'Антон Чехов', годы: '1860–1904',
    слава: 'Великий русский писатель и врач, один из величайших мастеров рассказа и драмы в мире.',
    en: { имя: 'Anton Chekhov', слава: 'Great Russian writer and doctor, one of the world’s greatest masters of the short story and drama.' } }),
  А({ id: 'stolypin', имя: 'Пётр Столыпин', годы: '1862–1911',
    слава: 'Великий русский реформатор и премьер-министр: дал крестьянам землю в собственность.',
    en: { имя: 'Pyotr Stolypin', слава: 'Great Russian reformer and prime minister who gave peasants land of their own.' } }),
  А({ id: 'tsiolkovsky', имя: 'Константин Циолковский', годы: '1857–1935',
    слава: 'Великий русский учёный, основоположник космонавтики; калужский учитель, рассчитавший полёт ракеты в космос.',
    en: { имя: 'Konstantin Tsiolkovsky', слава: 'Great Russian scientist and father of space flight; a Kaluga schoolteacher who worked out how a rocket reaches space.' } }),
  А({ id: 'bulgakov', имя: 'Михаил Булгаков', годы: '1891–1940',
    слава: 'Великий русский писатель, автор «Мастера и Маргариты» и «Собачьего сердца».',
    en: { имя: 'Mikhail Bulgakov', слава: 'Great Russian writer, author of “The Master and Margarita” and “Heart of a Dog”.' } }),
  А({ id: 'esenin', имя: 'Сергей Есенин', годы: '1895–1925',
    слава: 'Великий русский поэт, певец русской деревни и природы, один из самых любимых в народе.',
    en: { имя: 'Sergei Yesenin', слава: 'Great Russian poet who sang the Russian village and countryside, among the most loved by the people.' } }),
  А({ id: 'gagarin', имя: 'Юрий Гагарин', годы: '1934–1968',
    слава: 'Русский человек, первым в истории человечества поднявшийся в космос, — 12 апреля 1961 года.',
    en: { имя: 'Yuri Gagarin', слава: 'The Russian who became the first human in history to fly into space, on 12 April 1961.' } }),
  А({ id: 'mendeleev', имя: 'Дмитрий Менделеев', годы: '1834–1907',
    слава: 'Великий русский учёный, создатель периодической системы элементов и экономист; «Заветные мысли» — о труде, сбережениях и богатстве народа.',
    en: { имя: 'Dmitri Mendeleev', слава: 'Great Russian scientist who created the periodic table, and an economist; “Cherished Thoughts” is about labour, saving and the wealth of the nation.' } }),
  А({ id: 'denikin', имя: 'Антон Деникин', годы: '1872–1947',
    слава: 'Русский генерал, вождь Белого движения, главнокомандующий Вооружёнными силами Юга России; автор «Очерков русской смуты».',
    en: { имя: 'Anton Denikin', слава: 'Russian general and leader of the White movement, commander-in-chief of the Armed Forces of South Russia; author of “Sketches of the Russian Turmoil”.' } }),
  А({ id: 'vrangel', имя: 'Пётр Врангель', годы: '1878–1928',
    слава: 'Русский генерал, последний главнокомандующий Белой армии; в 1920 году с честью вывел из Крыма армию и беженцев.',
    en: { имя: 'Pyotr Wrangel', слава: 'Russian general, the last commander-in-chief of the White army; in 1920 he evacuated the army and refugees from the Crimea with honour.' } }),
  А({ id: 'narod', имя: 'Народная мудрость', годы: 'из собрания В. И. Даля', портрет: 'dal',
    слава: 'Мудрость русского народа из собрания Владимира Даля — врача, моряка и создателя великого «Толкового словаря», записавшего больше 30 000 пословиц.',
    en: { имя: 'Folk wisdom', годы: 'collected by Vladimir Dal', слава: 'The wisdom of the Russian people collected by Vladimir Dal — doctor, sailor and author of the great Explanatory Dictionary, who wrote down more than 30,000 proverbs.' } }),
]
