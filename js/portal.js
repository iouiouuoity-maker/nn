import { api, getToken, setToken } from "./api.js";

const role = document.body.dataset.role;
const page = document.body.dataset.page;
const shell = document.getElementById("appShell");

const studentPages = [
  ["library", "student-library.html", "Моя библиотека"],
  ["assignments", "student-assignments.html", "Мои задания"],
  ["workshop", "student-workshop.html", "Паспорт героя"],
  ["mistakes", "student-mistakes.html", "Работа над ошибками"],
  ["achievements", "student-achievements.html", "Мои достижения"]
];
const teacherPages = [
  ["overview", "teacher-overview.html", "Обзор класса"],
  ["assignments", "teacher-assignments.html", "Конструктор заданий"],
  ["submissions", "teacher-submissions.html", "Проверка работ"],
  ["difficulties", "teacher-difficulties.html", "Карта затруднений"],
  ["students", "teacher-students.html", "Коды учеников"],
  ["library", "teacher-library.html", "Библиотека"]
];
const pages = role === "teacher" ? teacherPages : studentPages;
const title = pages.find(item => item[0] === page)?.[2] || "Кабинет";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const empty = text => `<div class="empty-state">${escapeHtml(text)}</div>`;
const errorBanner = text => `<div class="error-banner">${escapeHtml(text)}</div>`;
const metric = (label, value) => `<article class="metric-card"><span>${label}</span><strong>${Number(value || 0)}</strong></article>`;

function renderShell(user) {
  const teacher = role === "teacher";
  shell.innerHTML = `
    <header class="topbar"><a class="brand" href="${teacher ? "teacher-overview.html" : "student-library.html"}"><span class="brand-mark">360°</span><span><strong>ГЕРОЙ</strong><small>AI · литературная лаборатория</small></span></a><button id="logoutButton" class="button ghost">Выйти</button></header>
    <main class="app-view multipage-view">
      <aside class="sidebar"><div class="profile-card"><span class="avatar ${teacher ? "teacher-avatar" : ""}">${teacher ? "Л" : "У"}</span><div><strong>${escapeHtml(user.label)}</strong><small>${teacher ? "Учитель" : "6 класс"}</small></div></div>
        <nav class="side-nav">${pages.map(([key, href, label]) => `<a class="nav-item ${key === page ? "active" : ""}" href="${href}">${label}</a>`).join("")}</nav>
      </aside>
      <section class="workspace"><div class="workspace-heading"><div><p class="eyebrow">${teacher ? "Моя педагогическая мастерская" : "Моя литературная мастерская"}</p><h1 class="page-title">${title}</h1></div><span class="source-chip ${teacher ? "teacher-chip" : ""}">${teacher ? "11 учеников" : "Атамұра · 2018"}</span></div><div id="pageContent"><div class="empty-state">Загрузка…</div></div></section>
    </main>
    <dialog id="reviewDialog" class="work-dialog"><form method="dialog" class="dialog-close"><button aria-label="Закрыть">×</button></form><div id="reviewDialogContent"></div></dialog>`;
  document.getElementById("logoutButton").addEventListener("click", () => { setToken(null); location.href = "index.html"; });
}

function workCard(work, label = "Открыть маршрут") {
  const link = role === "teacher" ? `teacher-library.html#${encodeURIComponent(work.id)}` : `analysis.html?work=${encodeURIComponent(work.id)}`;
  return `<article class="work-card"><div class="meta"><span class="part-pill">Часть ${work.part}</span><span>урок ${escapeHtml(work.lesson)} · стр. ${work.page}</span></div><h3>${escapeHtml(work.title)}</h3><p class="author">${escapeHtml(work.author)}</p><p class="section">${escapeHtml(work.section)}</p><a class="button secondary button-link" href="${link}">${label}</a></article>`;
}

async function renderStudent() {
  const content = document.getElementById("pageContent");
  if (page === "library") {
    const data = await api.library();
    content.innerHTML = `<div class="card-grid">${data.items.map(work => workCard(work)).join("")}</div>`;
    return;
  }
  if (page === "assignments") {
    const data = await api.assignments();
    content.innerHTML = data.items.length ? `<div class="card-grid">${data.items.map(item => workCard(item.work, item.completed ? "Посмотреть" : "Выполнить")).join("")}</div>` : empty("Учитель пока не назначил задания.");
    return;
  }
  const data = await api.submissions();
  const submissions = data.items;
  if (page === "workshop") {
    content.innerHTML = submissions.length ? submissions.map(submissionCard).join("") : empty("Завершённые паспорта героя появятся здесь.");
    return;
  }
  if (page === "mistakes") {
    const items = submissions.filter(item => item.initial_answer && !item.revised_answer);
    content.innerHTML = items.length ? items.map(item => `<article class="panel-card"><span class="tag warn">Нужно уточнить</span><h3>${escapeHtml(item.work_title)}</h3><p>${escapeHtml(item.initial_answer)}</p><a class="button secondary button-link" href="analysis.html?work=${encodeURIComponent(item.work_id)}&submission=${encodeURIComponent(item.id)}">Исправить ответ</a></article>`).join("") : empty("Сейчас нет ответов, ожидающих исправления.");
    return;
  }
  const completed = submissions.filter(item => item.status === "submitted").length;
  const revised = submissions.filter(item => item.revised_answer).length;
  content.innerHTML = `<div class="metric-grid">${metric("Выполнено", completed)}${metric("Исправлено", revised)}${metric("Произведений", new Set(submissions.map(item => item.work_id)).size)}${metric("AI-подсказки", submissions.filter(item => item.help_used).length)}</div><div class="panel-card"><h3>Как считается прогресс</h3><p>Только по сохранённым ответам и проверкам учителя. Приложение не создаёт оценки само.</p></div>`;
}

function submissionCard(item) {
  return `<article class="panel-card"><span class="tag ${item.revised_answer ? "ok" : ""}">${item.revised_answer ? "Ответ улучшен" : "Первый ответ"}</span><h3>${escapeHtml(item.work_title || "Работа")}</h3><div class="two-answers"><div><small>Первоначально</small><div class="answer-box">${escapeHtml(item.initial_answer)}</div></div><div><small>После подсказки</small><div class="answer-box">${escapeHtml(item.revised_answer || "Пока нет")}</div></div></div></article>`;
}

async function renderTeacher() {
  const content = document.getElementById("pageContent");
  if (page === "overview") {
    const o = await api.overview();
    content.innerHTML = `<div class="metric-grid">${metric("Ученики", o.students)}${metric("Назначено", o.assignments)}${metric("Сдано", o.submissions)}${metric("Ждут проверки", o.awaitingReview)}</div><div class="panel-card"><h3>Последние работы</h3>${submissionTable(o.recent || [])}</div>`;
    return;
  }
  if (page === "assignments") {
    const [students, library] = await Promise.all([api.teacherStudents(), api.library()]);
    content.innerHTML = `<div class="panel-card"><h3>Новое задание</h3><form id="assignmentForm" class="form-grid"><label>Произведение<select name="workId" required>${library.items.map(work => `<option value="${escapeHtml(work.id)}">${escapeHtml(work.author)} — ${escapeHtml(work.title)}</option>`).join("")}</select></label><label>Ученик<select name="studentId"><option value="all">Весь класс</option>${students.items.map(student => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.label)}</option>`).join("")}</select></label><label class="wide">Инструкция<textarea name="instructions" required>Заполни шесть шагов паспорта героя и приведи доказательство из текста.</textarea></label><label>Срок<input name="dueAt" type="date"></label><div></div><button class="button primary" type="submit">Назначить</button><p id="formMessage" class="form-message"></p></form></div>`;
    document.getElementById("assignmentForm").addEventListener("submit", createAssignment);
    return;
  }
  if (page === "submissions") {
    const data = await api.teacherSubmissions();
    window.submissionItems = data.items;
    content.innerHTML = `<div class="panel-card"><h3>Работы учеников</h3>${submissionTable(data.items, true)}</div>`;
    content.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", () => openReview(button.dataset.review)));
    return;
  }
  if (page === "difficulties") {
    const data = await api.overview();
    content.innerHTML = data.difficulties?.length ? `<div class="panel-card"><h3>Трудности по проверенным работам</h3><div class="table-wrap"><table><thead><tr><th>Тип</th><th>Работ</th><th>Следующее упражнение</th></tr></thead><tbody>${data.difficulties.map(item => `<tr><td>${escapeHtml(item.type)}</td><td>${item.count}</td><td>${escapeHtml(item.recommendation)}</td></tr>`).join("")}</tbody></table></div></div>` : empty("Карта появится после проверки работ учителем.");
    return;
  }
  if (page === "students") {
    const data = await api.teacherStudents();
    content.innerHTML = `<div class="panel-card"><h3>11 анонимных ученических кодов</h3><p>Код показывается только в момент установки. В базе хранится его хеш.</p><div class="table-wrap"><table><thead><tr><th>Код класса</th><th>Статус</th><th>Действие</th></tr></thead><tbody>${data.items.map(student => `<tr><td>${escapeHtml(student.label)}</td><td><span class="tag ${student.configured ? "ok" : "warn"}">${student.configured ? "настроен" : "нет кода"}</span></td><td><button class="button ghost" data-code-student="${escapeHtml(student.id)}">Установить</button></td></tr>`).join("")}</tbody></table></div></div>`;
    content.querySelectorAll("[data-code-student]").forEach(button => button.addEventListener("click", () => setStudentCode(button.dataset.codeStudent)));
    return;
  }
  const data = await api.library();
  content.innerHTML = `<div class="card-grid">${data.items.map(work => workCard(work, "Проверено")).join("")}</div><div class="panel-card"><h3>Добавить свой материал</h3><p>Материал будет помечен как пользовательский и не будет выдаваться за содержание учебника.</p><form id="workForm" class="form-grid"><label>Автор<input name="author" required></label><label>Название<input name="title" required></label><label class="wide">Разрешённый фрагмент<textarea name="excerpt" maxlength="5000"></textarea></label><button class="button primary">Добавить</button><p id="formMessage" class="form-message"></p></form></div>`;
  document.getElementById("workForm").addEventListener("submit", createWork);
}

async function createAssignment(event) {
  event.preventDefault(); const message = document.getElementById("formMessage");
  try { const result = await api.createAssignment(Object.fromEntries(new FormData(event.currentTarget))); message.textContent = `Создано заданий: ${result.created}`; message.className = "form-message success"; }
  catch (error) { message.textContent = error.message; message.className = "form-message error"; }
}

async function createWork(event) {
  event.preventDefault(); const message = document.getElementById("formMessage");
  try { await api.createWork(Object.fromEntries(new FormData(event.currentTarget))); message.textContent = "Материал добавлен."; message.className = "form-message success"; event.currentTarget.reset(); }
  catch (error) { message.textContent = error.message; message.className = "form-message error"; }
}

async function setStudentCode(id) {
  const code = prompt("Введите новый временный код длиной не менее 10 символов:");
  if (!code) return;
  try { await api.resetStudentCode(id, code); location.reload(); }
  catch (error) { alert(error.message); }
}

function submissionTable(items, review = false) {
  if (!items.length) return empty("Работ пока нет.");
  return `<div class="table-wrap"><table><thead><tr><th>Ученик</th><th>Произведение</th><th>Версии</th><th>Статус</th>${review ? "<th></th>" : ""}</tr></thead><tbody>${items.map(item => `<tr><td>${escapeHtml(item.student_label)}</td><td>${escapeHtml(item.work_title)}</td><td>${item.revised_answer ? 2 : 1}</td><td><span class="tag ${item.reviewed_at ? "ok" : "warn"}">${item.reviewed_at ? "проверено" : "ожидает"}</span></td>${review ? `<td><button class="button ghost" data-review="${escapeHtml(item.id)}">Открыть</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

function openReview(id) {
  const item = window.submissionItems.find(candidate => candidate.id === id);
  if (!item) return;
  document.getElementById("reviewDialogContent").innerHTML = `<div class="dialog-body"><p class="eyebrow">Проверка работы</p><h2>${escapeHtml(item.student_label)} · ${escapeHtml(item.work_title)}</h2><div class="two-answers"><div><small>Первоначально</small><div class="answer-box">${escapeHtml(item.initial_answer)}</div></div><div><small>После подсказки</small><div class="answer-box">${escapeHtml(item.revised_answer || "Нет исправленной версии")}</div></div></div><form id="reviewForm" class="form-grid">${["emotion","motive","evidence","perspective","consequence"].map(key => `<label>${key}<select name="${key}"><option value="0">0 — пока нет</option><option value="1">1 — частично</option><option value="2">2 — уверенно</option></select></label>`).join("")}<label>Затруднение<select name="difficulty"><option value="">Не отмечать</option><option>Не называет эмоцию</option><option>Путает мотив и поступок</option><option>Нет доказательства</option><option>Не учитывает другую позицию</option><option>Не объясняет последствия</option></select></label><label class="wide">Комментарий<textarea name="comment" required></textarea></label><button class="button primary">Сохранить</button><p id="reviewMessage" class="form-message"></p></form></div>`;
  document.getElementById("reviewDialog").showModal();
  document.getElementById("reviewForm").addEventListener("submit", async event => {
    event.preventDefault(); const message = document.getElementById("reviewMessage");
    try { await api.reviewSubmission(id, Object.fromEntries(new FormData(event.currentTarget))); message.textContent = "Проверка сохранена."; message.className = "form-message success"; }
    catch (error) { message.textContent = error.message; message.className = "form-message error"; }
  });
}

async function init() {
  if (!getToken()) { location.replace("index.html"); return; }
  try {
    const { user } = await api.me();
    if (user.role !== role) { location.replace(user.role === "teacher" ? "teacher-overview.html" : "student-library.html"); return; }
    renderShell(user);
    if (role === "teacher") await renderTeacher(); else await renderStudent();
  } catch (error) {
    if (error.status === 401) { setToken(null); location.replace("index.html"); return; }
    shell.innerHTML = `<main class="standalone-error">${errorBanner(error.message)}<a class="button ghost button-link" href="index.html">Вернуться ко входу</a></main>`;
  }
}

init();
