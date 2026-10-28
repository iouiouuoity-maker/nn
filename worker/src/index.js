const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 80_000;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/api/health" && request.method === "GET") {
        return json({ ok: true, service: "hero360-api" }, 200, cors);
      }

      if (path === "/api/auth/teacher" && request.method === "POST") {
        return await teacherLogin(request, env, cors);
      }

      if (path === "/api/auth/student" && request.method === "POST") {
        return await studentLogin(request, env, cors);
      }

      const user = await authenticate(request, env);
      if (!user) return json({ error: "Требуется вход" }, 401, cors);

      if (path === "/api/me" && request.method === "GET") {
        return json({ user }, 200, cors);
      }

      if (path === "/api/library" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT id, part, lesson, page, section, author, title, kind, characters_json, verified, custom FROM works WHERE active = 1 ORDER BY custom, part, page").all();
        return json({ items: result.results.map(serializeWork) }, 200, cors);
      }

      if (path === "/api/assignments" && request.method === "GET") {
        if (user.role !== "student") return json({ error: "Доступно только ученику" }, 403, cors);
        const result = await env.DB.prepare(`
          SELECT a.*, w.author, w.title, w.part, w.lesson, w.page, w.section, w.kind, w.characters_json,
                 CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS completed
          FROM assignments a
          JOIN works w ON w.id = a.work_id
          LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = a.student_id
          WHERE a.student_id = ? AND a.active = 1
          ORDER BY a.created_at DESC
        `).bind(user.sub).all();
        return json({ items: result.results.map(row => ({
          ...row,
          completed: Boolean(row.completed),
          work: serializeWork({ ...row, id: row.work_id })
        })) }, 200, cors);
      }

      if (path === "/api/submissions" && request.method === "GET") {
        if (user.role !== "student") return json({ error: "Доступно только ученику" }, 403, cors);
        const result = await env.DB.prepare(`
          SELECT s.*, w.title AS work_title, w.author AS work_author
          FROM submissions s JOIN works w ON w.id = s.work_id
          WHERE s.student_id = ? ORDER BY s.updated_at DESC
        `).bind(user.sub).all();
        return json({ items: result.results.map(serializeSubmission) }, 200, cors);
      }

      if (path === "/api/submissions" && request.method === "POST") {
        if (user.role !== "student") return json({ error: "Доступно только ученику" }, 403, cors);
        return await createSubmission(request, env, user, cors);
      }

      const revisionMatch = path.match(/^\/api\/submissions\/([^/]+)\/revision$/);
      if (revisionMatch && request.method === "PUT") {
        if (user.role !== "student") return json({ error: "Доступно только ученику" }, 403, cors);
        return await reviseSubmission(request, env, user, decodeURIComponent(revisionMatch[1]), cors);
      }

      if (path === "/api/ai/hint" && request.method === "POST") {
        if (user.role !== "student") return json({ error: "Доступно только ученику" }, 403, cors);
        return await aiHint(request, env, user, cors);
      }

      if (path === "/api/ai/dialogue" && request.method === "POST") {
        if (user.role !== "student") return json({ error: "Доступно только ученику" }, 403, cors);
        return await aiDialogue(request, env, user, cors);
      }

      if (user.role !== "teacher") return json({ error: "Требуется роль учителя" }, 403, cors);

      if (path === "/api/teacher/overview" && request.method === "GET") {
        return await teacherOverview(env, cors);
      }

      if (path === "/api/teacher/students" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT id, label, active, CASE WHEN code_hash IS NULL THEN 0 ELSE 1 END AS configured FROM students ORDER BY label").all();
        return json({ items: result.results.map(row => ({ ...row, configured: Boolean(row.configured), active: Boolean(row.active) })) }, 200, cors);
      }

      const codeMatch = path.match(/^\/api\/teacher\/students\/([^/]+)\/code$/);
      if (codeMatch && request.method === "PUT") {
        return await resetStudentCode(request, env, decodeURIComponent(codeMatch[1]), cors);
      }

      if (path === "/api/teacher/submissions" && request.method === "GET") {
        const result = await env.DB.prepare(`
          SELECT s.*, st.label AS student_label, w.title AS work_title, w.author AS work_author, r.reviewed_at
          FROM submissions s
          JOIN students st ON st.id = s.student_id
          JOIN works w ON w.id = s.work_id
          LEFT JOIN reviews r ON r.submission_id = s.id
          ORDER BY s.updated_at DESC
        `).all();
        return json({ items: result.results.map(serializeSubmission) }, 200, cors);
      }

      if (path === "/api/teacher/assignments" && request.method === "POST") {
        return await createAssignment(request, env, cors);
      }

      const reviewMatch = path.match(/^\/api\/teacher\/submissions\/([^/]+)\/review$/);
      if (reviewMatch && request.method === "PUT") {
        return await reviewSubmission(request, env, decodeURIComponent(reviewMatch[1]), cors);
      }

      if (path === "/api/teacher/works" && request.method === "POST") {
        return await createWork(request, env, cors);
      }

      return json({ error: "Маршрут не найден" }, 404, cors);
    } catch (error) {
      console.error(error);
      const status = error.status || 500;
      const safeMessage = status >= 500 ? "Внутренняя ошибка сервера" : error.message;
      return json({ error: safeMessage }, status, cors);
    }
  }
};

async function teacherLogin(request, env, cors) {
  const body = await readJson(request);
  const login = clean(body.login, 80);
  const password = String(body.password || "");
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  await enforceRateLimit(env, `teacher:${ip}`, 6, 15 * 60);

  if (login !== "laila.teacher" || !password || !env.TEACHER_PASSWORD_HASH || !env.TEACHER_PASSWORD_SALT) {
    await recordLoginFailure(env, `teacher:${ip}`);
    return json({ error: "Неверный логин или пароль" }, 401, cors);
  }

  const hash = await pbkdf2(password, env.TEACHER_PASSWORD_SALT);
  if (!constantTimeEqual(hash, env.TEACHER_PASSWORD_HASH)) {
    await recordLoginFailure(env, `teacher:${ip}`);
    return json({ error: "Неверный логин или пароль" }, 401, cors);
  }

  await clearLoginFailures(env, `teacher:${ip}`);
  const user = { sub: "laila.teacher", role: "teacher", label: "laila.teacher" };
  return json({ token: await createToken(user, env), user }, 200, cors);
}

async function studentLogin(request, env, cors) {
  const body = await readJson(request);
  const code = clean(body.code, 120);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  await enforceRateLimit(env, `student:${ip}`, 15, 15 * 60);
  if (code.length < 6 || !env.STUDENT_CODE_PEPPER) {
    await recordLoginFailure(env, `student:${ip}`);
    return json({ error: "Неверный код ученика" }, 401, cors);
  }

  const codeHash = await sha256Base64(`${env.STUDENT_CODE_PEPPER}:${code}`);
  const student = await env.DB.prepare("SELECT id, label, auth_version FROM students WHERE code_hash = ? AND active = 1").bind(codeHash).first();
  if (!student) {
    await recordLoginFailure(env, `student:${ip}`);
    return json({ error: "Неверный код ученика" }, 401, cors);
  }

  await clearLoginFailures(env, `student:${ip}`);
  const user = { sub: student.id, role: "student", label: student.label, ver: student.auth_version };
  return json({ token: await createToken(user, env), user }, 200, cors);
}

async function createSubmission(request, env, user, cors) {
  const body = await readJson(request);
  const workId = clean(body.workId, 80);
  const assignmentId = body.assignmentId ? clean(body.assignmentId, 80) : null;
  const character = clean(body.character, 160);
  const excerpt = clean(body.excerpt, 3000);
  const initialAnswer = clean(body.initialAnswer, 9000);
  const revisedAnswer = body.revisedAnswer ? clean(body.revisedAnswer, 5000) : null;
  const answers = validateAnswers(body.answers);

  if (!workId || !excerpt || !initialAnswer) throw badRequest("Заполните фрагмент и ответы");
  const work = await env.DB.prepare("SELECT id, title FROM works WHERE id = ? AND active = 1").bind(workId).first();
  if (!work) throw badRequest("Произведение не найдено");
  if (assignmentId) {
    const assignment = await env.DB.prepare("SELECT id FROM assignments WHERE id = ? AND student_id = ? AND work_id = ? AND active = 1").bind(assignmentId, user.sub, workId).first();
    if (!assignment) throw badRequest("Назначение не найдено");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO submissions (id, assignment_id, student_id, work_id, character_name, excerpt, answers_json, initial_answer, revised_answer, help_used, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
  `).bind(id, assignmentId, user.sub, workId, character, excerpt, JSON.stringify(answers), initialAnswer, revisedAnswer, body.helpUsed ? 1 : 0, now, now).run();

  const item = await env.DB.prepare("SELECT s.*, ? AS work_title FROM submissions s WHERE s.id = ?").bind(work.title, id).first();
  return json({ item: serializeSubmission(item) }, 201, cors);
}

async function reviseSubmission(request, env, user, id, cors) {
  const body = await readJson(request);
  const revised = clean(body.revisedAnswer, 5000);
  if (!revised) throw badRequest("Исправленный ответ пуст");
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE submissions SET revised_answer = ?, updated_at = ? WHERE id = ? AND student_id = ?").bind(revised, now, id, user.sub).run();
  if (!result.meta.changes) return json({ error: "Работа не найдена" }, 404, cors);
  return json({ ok: true }, 200, cors);
}

async function aiHint(request, env, user, cors) {
  if (!env.AI) return json({ error: "Workers AI binding не настроен" }, 503, cors);
  const body = await readJson(request);
  const workId = clean(body.workId, 80);
  const work = await env.DB.prepare("SELECT author, title FROM works WHERE id = ? AND active = 1").bind(workId).first();
  if (!work) throw badRequest("Произведение не найдено");
  const excerpt = clean(body.excerpt, 3000);
  const answer = clean(body.answer, 1800);
  const character = clean(body.character, 160);
  const step = clean(body.step, 40);
  if (!excerpt || !answer) throw badRequest("Нужны фрагмент и собственный ответ ученика");

  const prompt = `Ты — бережный наставник по литературе для 6 класса Я2. Произведение: ${work.author}, «${work.title}». Шаг анализа: ${step}. Персонаж: ${character || "не указан"}.
РАЗРЕШЁННЫЙ ФРАГМЕНТ УЧИТЕЛЯ:\n${excerpt}\n\nОТВЕТ УЧЕНИКА:\n${answer}
Дай только один короткий уточняющий вопрос на русском языке (до 35 слов). Не пиши готовый ответ, не придумывай цитаты и факты вне фрагмента. Если доказательства нет во фрагменте, попроси проверить текст.`;
  const result = await env.AI.run(env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct", { messages: [{ role: "user", content: prompt }], max_tokens: 90, temperature: 0.25 });
  const hint = clean(result.response || result.result?.response, 500);
  await env.DB.prepare("INSERT INTO ai_events (id, student_id, work_id, mode, created_at) VALUES (?, ?, ?, 'hint', ?)").bind(crypto.randomUUID(), user.sub, workId, new Date().toISOString()).run();
  return json({ hint: hint || "Какой конкретный эпизод подтверждает твою мысль?" }, 200, cors);
}

async function aiDialogue(request, env, user, cors) {
  if (!env.AI) return json({ error: "Workers AI binding не настроен" }, 503, cors);
  const body = await readJson(request);
  const workId = clean(body.workId, 80);
  const work = await env.DB.prepare("SELECT author, title FROM works WHERE id = ? AND active = 1").bind(workId).first();
  if (!work) throw badRequest("Произведение не найдено");
  const excerpt = clean(body.excerpt, 3000);
  const question = clean(body.question, 1000);
  const character = clean(body.character, 160);
  if (!excerpt || !question || !character) throw badRequest("Нужны персонаж, фрагмент и вопрос");
  const prompt = `Учебная ИИ-реконструкция диалога по произведению ${work.author}, «${work.title}». Персонаж: ${character}. Используй ТОЛЬКО фрагмент ниже. Не изображай слова автора и не придумывай факты. Ответь 1–2 предложениями и закончи вопросом, который просит ученика найти текстовое доказательство. Начни с пометки «Учебная ИИ-реконструкция:».
ФРАГМЕНТ:\n${excerpt}\n\nВОПРОС УЧЕНИКА:\n${question}`;
  const result = await env.AI.run(env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct", { messages: [{ role: "user", content: prompt }], max_tokens: 150, temperature: 0.3 });
  const answer = clean(result.response || result.result?.response, 900);
  await env.DB.prepare("INSERT INTO ai_events (id, student_id, work_id, mode, created_at) VALUES (?, ?, ?, 'dialogue', ?)").bind(crypto.randomUUID(), user.sub, workId, new Date().toISOString()).run();
  return json({ answer }, 200, cors);
}

async function teacherOverview(env, cors) {
  const [students, assignments, submissions, awaiting, recent, difficulties] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM students WHERE active = 1").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM assignments WHERE active = 1").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE status = 'submitted'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM submissions s LEFT JOIN reviews r ON r.submission_id = s.id WHERE s.status = 'submitted' AND r.submission_id IS NULL").first(),
    env.DB.prepare(`SELECT s.id, st.label AS student_label, w.title AS work_title, s.revised_answer, r.reviewed_at FROM submissions s JOIN students st ON st.id = s.student_id JOIN works w ON w.id = s.work_id LEFT JOIN reviews r ON r.submission_id = s.id ORDER BY s.updated_at DESC LIMIT 8`).all(),
    env.DB.prepare("SELECT difficulty AS type, COUNT(*) AS count FROM reviews WHERE difficulty IS NOT NULL AND difficulty <> '' GROUP BY difficulty ORDER BY count DESC").all()
  ]);
  const recommendations = {
    "Не называет эмоцию": "Выбери подходящее чувство",
    "Путает мотив и поступок": "Найди причину",
    "Нет доказательства": "Найди строку в тексте",
    "Не учитывает другую позицию": "Посмотри глазами другого героя",
    "Не объясняет последствия": "Продолжи историю"
  };
  return json({
    students: students.count,
    assignments: assignments.count,
    submissions: submissions.count,
    awaitingReview: awaiting.count,
    recent: recent.results,
    difficulties: difficulties.results.map(item => ({ ...item, recommendation: recommendations[item.type] || "Назначить индивидуальное упражнение" }))
  }, 200, cors);
}

async function resetStudentCode(request, env, id, cors) {
  const body = await readJson(request);
  const code = clean(body.code, 120);
  if (code.length < 10) throw badRequest("Код должен содержать не менее 10 символов");
  if (!env.STUDENT_CODE_PEPPER) throw serverConfig("STUDENT_CODE_PEPPER не настроен");
  const hash = await sha256Base64(`${env.STUDENT_CODE_PEPPER}:${code}`);
  const result = await env.DB.prepare("UPDATE students SET code_hash = ?, auth_version = auth_version + 1, updated_at = ? WHERE id = ?").bind(hash, new Date().toISOString(), id).run();
  if (!result.meta.changes) return json({ error: "Ученик не найден" }, 404, cors);
  return json({ ok: true }, 200, cors);
}

async function createAssignment(request, env, cors) {
  const body = await readJson(request);
  const workId = clean(body.workId, 80);
  const studentId = clean(body.studentId, 80);
  const instructions = clean(body.instructions, 2000);
  const dueAt = body.dueAt ? clean(body.dueAt, 40) : null;
  if (!workId || !studentId || !instructions) throw badRequest("Заполните произведение, ученика и инструкцию");
  const work = await env.DB.prepare("SELECT id FROM works WHERE id = ? AND active = 1").bind(workId).first();
  if (!work) throw badRequest("Произведение не найдено");
  let students;
  if (studentId === "all") students = (await env.DB.prepare("SELECT id FROM students WHERE active = 1 ORDER BY id").all()).results;
  else {
    const student = await env.DB.prepare("SELECT id FROM students WHERE id = ? AND active = 1").bind(studentId).first();
    if (!student) throw badRequest("Ученик не найден");
    students = [student];
  }
  const now = new Date().toISOString();
  const statements = students.map(student => env.DB.prepare("INSERT INTO assignments (id, student_id, work_id, instructions, due_at, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)").bind(crypto.randomUUID(), student.id, workId, instructions, dueAt, now));
  if (statements.length) await env.DB.batch(statements);
  return json({ created: statements.length }, 201, cors);
}

async function reviewSubmission(request, env, id, cors) {
  const body = await readJson(request);
  const scores = ["emotion", "motive", "evidence", "perspective", "consequence"].map(key => score(body[key]));
  const difficulty = clean(body.difficulty, 120) || null;
  const comment = clean(body.comment, 2000);
  if (!comment) throw badRequest("Добавьте комментарий");
  const submission = await env.DB.prepare("SELECT id FROM submissions WHERE id = ?").bind(id).first();
  if (!submission) return json({ error: "Работа не найдена" }, 404, cors);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO reviews (submission_id, emotion, motive, evidence, perspective, consequence, difficulty, comment, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id) DO UPDATE SET emotion=excluded.emotion, motive=excluded.motive, evidence=excluded.evidence, perspective=excluded.perspective, consequence=excluded.consequence, difficulty=excluded.difficulty, comment=excluded.comment, reviewed_at=excluded.reviewed_at
  `).bind(id, ...scores, difficulty, comment, now).run();
  return json({ ok: true }, 200, cors);
}

async function createWork(request, env, cors) {
  const body = await readJson(request);
  const author = clean(body.author, 220);
  const title = clean(body.title, 260);
  const excerpt = clean(body.excerpt, 5000);
  if (!author || !title) throw badRequest("Укажите автора и название");
  const id = `custom-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO works (id, part, lesson, page, section, author, title, kind, characters_json, verified, custom, teacher_excerpt, active) VALUES (?, 0, '', 0, 'Материал учителя', ?, ?, 'пользовательский материал', '[]', 0, 1, ?, 1)`).bind(id, author, title, excerpt).run();
  return json({ item: { id, part: 0, lesson: "", page: 0, section: "Материал учителя", author, title, kind: "пользовательский материал", characters: [], verified: false, custom: true } }, 201, cors);
}

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const payload = await verifyToken(header.slice(7), env);
  if (!payload) return null;
  if (payload.role === "student") {
    const student = await env.DB.prepare("SELECT label, auth_version, active FROM students WHERE id = ?").bind(payload.sub).first();
    if (!student || !student.active || student.auth_version !== payload.ver) return null;
    payload.label = student.label;
  }
  return payload;
}

async function createToken(user, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw serverConfig("SESSION_SECRET не настроен");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...user, iat: nowSeconds(), exp: nowSeconds() + TOKEN_TTL_SECONDS }));
  const signature = await hmac(`${header}.${payload}`, env.SESSION_SECRET);
  return `${header}.${payload}.${signature}`;
}

async function verifyToken(token, env) {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature || !env.SESSION_SECRET) return null;
    const expected = await hmac(`${header}.${payload}`, env.SESSION_SECRET);
    if (!constantTimeEqual(signature, expected)) return null;
    const data = JSON.parse(new TextDecoder().decode(base64urlBytes(payload)));
    if (!data.exp || data.exp < nowSeconds() || !["student", "teacher"].includes(data.role)) return null;
    return data;
  } catch {
    return null;
  }
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function pbkdf2(password, saltBase64) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64Bytes(saltBase64), iterations: 210000 }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function sha256Base64(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i % left.length] || 0) ^ (right[i % right.length] || 0);
  return diff === 0;
}

async function enforceRateLimit(env, key, limit, windowSeconds) {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(cutoff).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE key = ? AND attempted_at >= ?").bind(key, cutoff).first();
  if (row.count >= limit) {
    const error = new Error("Слишком много попыток. Попробуйте позже.");
    error.status = 429;
    throw error;
  }
}

const recordLoginFailure = (env, key) => env.DB.prepare("INSERT INTO login_attempts (key, attempted_at) VALUES (?, ?)").bind(key, new Date().toISOString()).run();
const clearLoginFailures = (env, key) => env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    const error = new Error("Запрос слишком большой");
    error.status = 413;
    throw error;
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    const error = new Error("Запрос слишком большой");
    error.status = 413;
    throw error;
  }
  try { return JSON.parse(text || "{}"); }
  catch { throw badRequest("Некорректный JSON"); }
}

function validateAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("Ответы не заполнены");
  const keys = ["emotion", "motive", "action", "evidence", "perspective", "consequence"];
  const result = {};
  for (const key of keys) {
    result[key] = clean(value[key], 1500);
    if (!result[key]) throw badRequest(`Не заполнен шаг: ${key}`);
  }
  return result;
}

function serializeWork(row) {
  return {
    id: row.id,
    part: row.part,
    lesson: row.lesson,
    page: row.page,
    section: row.section,
    author: row.author,
    title: row.title,
    kind: row.kind,
    characters: parseJson(row.characters_json, []),
    verified: Boolean(row.verified),
    custom: Boolean(row.custom)
  };
}

function serializeSubmission(row) {
  return {
    ...row,
    answers: parseJson(row.answers_json, {}),
    help_used: Boolean(row.help_used)
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  const local = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const permitted = !origin || allowed.includes(origin) || (env.ENVIRONMENT !== "production" && local);
  return {
    "Access-Control-Allow-Origin": permitted && origin ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
}

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function score(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 2) throw badRequest("Оценка должна быть от 0 до 2");
  return parsed;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function serverConfig(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function nowSeconds() { return Math.floor(Date.now() / 1000); }
function b64url(value) { return bytesToBase64url(new TextEncoder().encode(value)); }
function bytesToBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function bytesToBase64url(bytes) { return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function base64Bytes(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
function base64urlBytes(value) { return base64Bytes(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)); }
