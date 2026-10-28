PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  code_hash TEXT UNIQUE,
  auth_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  part INTEGER NOT NULL,
  lesson TEXT NOT NULL,
  page INTEGER NOT NULL,
  section TEXT NOT NULL,
  author TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  characters_json TEXT NOT NULL DEFAULT '[]',
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  custom INTEGER NOT NULL DEFAULT 0 CHECK (custom IN (0, 1)),
  teacher_excerpt TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  work_id TEXT NOT NULL REFERENCES works(id),
  instructions TEXT NOT NULL,
  due_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES assignments(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  work_id TEXT NOT NULL REFERENCES works(id),
  character_name TEXT,
  excerpt TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  initial_answer TEXT NOT NULL,
  revised_answer TEXT,
  help_used INTEGER NOT NULL DEFAULT 0 CHECK (help_used IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  emotion INTEGER NOT NULL CHECK (emotion BETWEEN 0 AND 2),
  motive INTEGER NOT NULL CHECK (motive BETWEEN 0 AND 2),
  evidence INTEGER NOT NULL CHECK (evidence BETWEEN 0 AND 2),
  perspective INTEGER NOT NULL CHECK (perspective BETWEEN 0 AND 2),
  consequence INTEGER NOT NULL CHECK (consequence BETWEEN 0 AND 2),
  difficulty TEXT,
  comment TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_events (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  work_id TEXT NOT NULL REFERENCES works(id),
  mode TEXT NOT NULL CHECK (mode IN ('hint', 'dialogue')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_student ON assignments(student_id, active);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_submissions_work ON submissions(work_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time ON login_attempts(key, attempted_at);

INSERT OR IGNORE INTO students (id, label, created_at, updated_at) VALUES
  ('student-01', 'У01', datetime('now'), datetime('now')),
  ('student-02', 'У02', datetime('now'), datetime('now')),
  ('student-03', 'У03', datetime('now'), datetime('now')),
  ('student-04', 'У04', datetime('now'), datetime('now')),
  ('student-05', 'У05', datetime('now'), datetime('now')),
  ('student-06', 'У06', datetime('now'), datetime('now')),
  ('student-07', 'У07', datetime('now'), datetime('now')),
  ('student-08', 'У08', datetime('now'), datetime('now')),
  ('student-09', 'У09', datetime('now'), datetime('now')),
  ('student-10', 'У10', datetime('now'), datetime('now')),
  ('student-11', 'У11', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO works (id, part, lesson, page, section, author, title, kind, characters_json, verified, custom, active) VALUES
  ('atamura-1-05', 1, '5', 25, 'I. В человеке всё должно быть прекрасно', 'В. А. Осеева', 'Кто наказал его?', 'рассказ', '["мальчик"]', 1, 0, 1),
  ('atamura-1-06', 1, '6', 28, 'I. В человеке всё должно быть прекрасно', 'Б. Г. Каирбеков', 'Лица друзей', 'стихотворение', '[]', 1, 0, 1),
  ('atamura-1-07', 1, '7', 33, 'I. В человеке всё должно быть прекрасно', 'И. А. Крылов', 'Ворона и Лисица', 'басня', '["Ворона","Лисица"]', 1, 0, 1),
  ('atamura-1-08-09', 1, '8–9', 40, 'I. В человеке всё должно быть прекрасно', 'А. П. Чехов', 'Хамелеон', 'рассказ', '["Очумелов","Хрюкин","собака"]', 1, 0, 1),
  ('atamura-1-10-11', 1, '10–11', 49, 'I. В человеке всё должно быть прекрасно', 'Ч. Т. Айтматов', 'Солдатёнок', 'рассказ', '["Авальбек","Джеенгуль","солдат-артиллерист"]', 1, 0, 1),
  ('atamura-1-15', 1, '15', 67, 'II. Живой мир вокруг нас', 'М. Д. Зверев', 'Ласточки на паровозе', 'рассказ', '["ласточки","машинист"]', 1, 0, 1),
  ('atamura-1-16', 1, '16', 71, 'II. Живой мир вокруг нас', 'М. М. Пришвин', 'Этажи леса', 'рассказ', '[]', 1, 0, 1),
  ('atamura-1-17', 1, '17', 75, 'II. Живой мир вокруг нас', 'В. С. Токарева', 'Кошка на дороге', 'рассказ', '["кошка"]', 1, 0, 1),
  ('atamura-1-19-20', 1, '19–20', 88, 'II. Живой мир вокруг нас', 'Г. Н. Троепольский', 'Белый Бим Чёрное Ухо', 'повесть', '["Бим","Иван Иванович"]', 1, 0, 1),
  ('atamura-1-21', 1, '21', 97, 'II. Живой мир вокруг нас', 'С. Сейфуллин', 'Разлучённые лебеди', 'поэма', '["лебеди"]', 1, 0, 1),
  ('atamura-1-22', 1, '22', 101, 'II. Живой мир вокруг нас', 'К. Кулиев', 'Не разоряйте птичьего гнезда…', 'стихотворение', '[]', 1, 0, 1),
  ('atamura-1-36', 1, '36', 149, 'III. Климат: погода и времена года', 'К. Д. Ушинский', 'Лето', 'стихотворение', '[]', 1, 0, 1),
  ('atamura-1-37-38', 1, '37–38', 153, 'III. Климат: погода и времена года', 'Ф. И. Тютчев', 'Времена года в поэзии Ф. И. Тютчева', 'учебная подборка', '[]', 1, 0, 1),
  ('atamura-1-39-40', 1, '39–40', 160, 'III. Климат: погода и времена года', 'С. А. Есенин', 'Зима в поэзии С. А. Есенина', 'учебная подборка', '[]', 1, 0, 1),
  ('atamura-1-41-42', 1, '41–42', 165, 'IV. Чудеса света', 'Р. Л. Стайн', 'Проклятие гробницы фараона', 'роман (фрагмент)', '["Гейб","Сари","дядя Бен","Ахмед"]', 1, 0, 1),
  ('atamura-1-43', 1, '43', 176, 'IV. Чудеса света', 'Льюис Кэрролл', 'Алиса в Стране чудес', 'сказка', '["Алиса"]', 1, 0, 1),
  ('atamura-2-55-56', 2, '55–56', 49, 'V. Древние и современные цивилизации', 'К. Булычёв', 'Сто лет тому вперёд', 'фантастическая повесть', '["Коля","Алиса"]', 1, 0, 1),
  ('atamura-2-58-59', 2, '58–59', 66, 'V. Древние и современные цивилизации', 'А. Р. Беляев', 'Последний человек из Атлантиды', 'роман', '[]', 1, 0, 1),
  ('atamura-2-63', 2, '63', 89, 'VI. Язык и общение', 'Г. Тукай', 'Родной язык', 'стихотворение', '[]', 1, 0, 1),
  ('atamura-2-64', 2, '64', 92, 'VI. Язык и общение', 'К. Д. Бальмонт', 'Язык, великолепный наш язык…', 'стихотворение', '[]', 1, 0, 1),
  ('atamura-2-65', 2, '65', 96, 'VI. Язык и общение', 'И. А. Бунин', 'Лишь слову жизнь дана…', 'стихотворение', '[]', 1, 0, 1),
  ('atamura-2-66', 2, '66', 101, 'VI. Язык и общение', 'М. Макатаев', 'Три счастья', 'стихотворение', '[]', 1, 0, 1),
  ('atamura-2-67', 2, '67', 104, 'VII. Герои и антигерои: реальность и выдуманные истории', 'Казахская народная сказка', 'Ер Тостик', 'волшебная сказка', '["Ер Тостик"]', 1, 0, 1),
  ('atamura-2-68-69', 2, '68–69', 109, 'VII. Герои и антигерои: реальность и выдуманные истории', 'Г. Х. Андерсен', 'Снежная королева', 'сказка', '["Герда","Кай","Снежная королева"]', 1, 0, 1),
  ('atamura-2-70', 2, '70', 119, 'VII. Герои и антигерои: реальность и выдуманные истории', 'Лаймен Фрэнк Баум', 'Удивительный волшебник из страны Оз', 'сказка', '[]', 1, 0, 1),
  ('atamura-2-71-72', 2, '71–72', 123, 'VII. Герои и антигерои: реальность и выдуманные истории', 'Б. Н. Полевой', 'Повесть о настоящем человеке', 'повесть', '["Алексей Мересьев"]', 1, 0, 1),
  ('atamura-2-77-78', 2, '77–78', 139, 'VIII. Планеты и спутники', 'Автор в контент-плане не указан', 'Длинноволосая звезда', 'учебный текст', '[]', 1, 0, 1),
  ('atamura-2-79-81', 2, '79–81', 143, 'VIII. Планеты и спутники', 'Автор в контент-плане не указан', 'Мифы о Луне и Солнце', 'мифы', '[]', 1, 0, 1),
  ('atamura-2-86-87', 2, '86–87', 162, 'IX. Человек и мир техники', 'Н. Н. Носов', 'Телефон', 'рассказ', '["Мишка"]', 1, 0, 1),
  ('atamura-2-88-89', 2, '88–89', 169, 'IX. Человек и мир техники', 'Майк Гелприн', 'Свеча горела', 'фантастический рассказ', '[]', 1, 0, 1);
