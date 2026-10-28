import { api, getToken, setToken } from "./api.js";

const shell = document.getElementById("analysisShell");
const params = new URLSearchParams(location.search);
const workId = params.get("work");
const existingSubmissionId = params.get("submission");
const steps = [
  ["emotion", "1. Эмоция", "Что чувствует герой? По какому признаку это видно?"],
  ["motive", "2. Мотив", "Почему герой так поступил? Назови конкретную причину."],
  ["action", "3. Поступок", "Что именно сделал герой? Опиши действие точно."],
  ["evidence", "4. Доказательство", "Какой эпизод или короткая цитата подтверждает вывод?"],
  ["perspective", "5. Другой взгляд", "Как этот эпизод мог увидеть другой персонаж?"],
  ["consequence", "6. Последствие", "К чему привёл поступок? Что изменилось бы при другом выборе?"]
];
let work;
let assignments = [];

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function render(user, existing) {
  shell.innerHTML = `<header class="topbar"><a class="brand" href="student-library.html"><span class="brand-mark">360°</span><span><strong>ГЕРОЙ</strong><small>Маршрут анализа</small></span></a><div class="topbar-actions"><span class="status-badge online">${escapeHtml(user.label)}</span><a class="button ghost button-link" href="student-library.html">К библиотеке</a></div></header>
  <main class="analysis-page"><section class="analysis-header"><p class="eyebrow">${escapeHtml(work.section)}</p><h1 class="analysis-title">${escapeHtml(work.title)}</h1><p class="lead">${escapeHtml(work.author)} · часть ${work.part}, урок ${escapeHtml(work.lesson)}, стр. ${work.page}</p><div class="error-banner">Работайте только с фрагментом, который дал учитель. Полный текст учебника в приложение не копируется.</div></section>
  <form id="analysisForm" class="analysis-form" data-work-id="${escapeHtml(work.id)}">
    <section class="panel-card"><h3>Эпизод и персонаж</h3><div class="form-grid"><label>Персонаж<select name="character"><option value="">Выберите</option>${(work.characters || []).map(name => `<option>${escapeHtml(name)}</option>`).join("")}</select></label><label>Другой персонаж<input name="customCharacter" placeholder="Если имени нет в списке"></label><label class="wide">Фрагмент / описание эпизода<textarea name="excerpt" maxlength="3000" required></textarea></label></div></section>
    <div class="stepper">${steps.map(() => '<span class="step-dot active"></span>').join("")}</div>
    ${steps.map(([key,title,prompt]) => `<section class="analysis-step"><h2>${title}</h2><p>${prompt}</p><textarea name="${key}" maxlength="1500" required></textarea><button class="button ghost" type="button" data-hint="${key}">Получить вопрос-подсказку</button><div class="hint-box hidden" data-hint-box="${key}"></div></section>`).join("")}
    <section class="panel-card"><h3>Интерактивные AI-режимы</h3><p class="security-note">Ответ персонажа — учебная ИИ-реконструкция, а не слова автора.</p><div class="mode-grid"><button class="mode-button" type="button" data-ai-mode="dialogue"><strong>Диалог с героем</strong><span>Задай персонажу вопрос</span></button><button class="mode-button" type="button" data-ai-mode="weak"><strong>Найди слабое место</strong><span>Уточни рассуждение</span></button><button class="mode-button" type="button" data-ai-mode="views"><strong>Два взгляда · AI-дебат</strong><span>Сравни позиции</span></button><button class="mode-button" type="button" data-ai-mode="whatif"><strong>Что будет, если…</strong><span>Рассмотри последствия</span></button></div><div id="aiModeInput" class="hidden"><label>Ваш вопрос или рассуждение<textarea name="aiModeQuestion" maxlength="1200"></textarea></label><button class="button secondary" type="button" id="runAiMode">Продолжить</button></div><div id="aiModeResult" class="hint-box hidden" data-hint-box="interactive"></div></section>
    <section class="panel-card"><h3>${existing ? "Исправление ответа" : "Итоговый ответ"}</h3><label>Исправленный итоговый ответ<textarea name="revised" maxlength="3000" placeholder="Необязательно при первой отправке"></textarea></label>${existing ? `<div class="answer-box"><small>Первоначальная версия</small><p>${escapeHtml(existing.initial_answer)}</p></div>` : ""}<button class="button primary full" type="submit">${existing ? "Сохранить исправление" : "Отправить работу"}</button><p id="analysisMessage" class="form-message" aria-live="polite"></p></section>
  </form></main>`;
  const form = document.getElementById("analysisForm");
  if (existing) {
    form.elements.excerpt.value = existing.excerpt || "";
    form.elements.character.value = existing.character_name || "";
    for (const [key] of steps) form.elements[key].value = existing.answers?.[key] || "";
    form.elements.revised.value = existing.revised_answer || "";
  }
  form.querySelectorAll("[data-hint]").forEach(button => button.addEventListener("click", () => requestHint(form, button)));
  form.querySelectorAll("[data-ai-mode]").forEach(button => button.addEventListener("click", () => selectAiMode(form, button)));
  form.addEventListener("submit", event => save(event, existing));
}

async function requestHint(form, button) {
  const key = button.dataset.hint;
  const box = form.querySelector(`[data-hint-box="${key}"]`);
  const answer = form.elements[key].value.trim();
  if (!answer) { box.textContent = "Сначала напишите свой вариант."; box.classList.remove("hidden"); return; }
  button.disabled = true;
  try { const data = await api.hint({ workId, character: selectedCharacter(form), excerpt: form.elements.excerpt.value, step: key, answer }); box.textContent = data.hint; }
  catch (error) { box.textContent = error.message; }
  finally { box.classList.remove("hidden"); button.disabled = false; }
}

function selectAiMode(form, button) {
  form.dataset.aiMode = button.dataset.aiMode;
  form.querySelectorAll("[data-ai-mode]").forEach(item => item.classList.toggle("active", item === button));
  document.getElementById("aiModeInput").classList.remove("hidden");
  const placeholders = { dialogue: "Почему ты так поступил?", weak: "Вставьте рассуждение для проверки.", views: "Опишите позицию одного героя.", whatif: "Какой выбор героя вы хотите изменить?" };
  form.elements.aiModeQuestion.placeholder = placeholders[button.dataset.aiMode];
  document.getElementById("runAiMode").onclick = () => runAiMode(form);
}

async function runAiMode(form) {
  const mode = form.dataset.aiMode;
  const question = form.elements.aiModeQuestion.value.trim();
  const excerpt = form.elements.excerpt.value.trim();
  const box = document.getElementById("aiModeResult");
  if (!question || !excerpt) { box.textContent = "Сначала добавьте фрагмент и свой вопрос."; box.classList.remove("hidden"); return; }
  const button = document.getElementById("runAiMode"); button.disabled = true;
  try {
    if (mode === "dialogue") {
      const character = selectedCharacter(form); if (!character) throw new Error("Выберите персонажа.");
      const data = await api.dialogue({ workId, character, excerpt, question }); box.textContent = data.answer;
    } else {
      const step = mode === "weak" ? "weak_spot" : mode === "views" ? "perspective" : "consequence";
      const data = await api.hint({ workId, character: selectedCharacter(form), excerpt, step, answer: question }); box.textContent = data.hint;
    }
  } catch (error) { box.textContent = error.message; }
  finally { box.classList.remove("hidden"); button.disabled = false; }
}

async function save(event, existing) {
  event.preventDefault(); const form = event.currentTarget; const message = document.getElementById("analysisMessage"); const button = form.querySelector('[type="submit"]'); button.disabled = true;
  try {
    if (existing) {
      const revisedAnswer = form.elements.revised.value.trim();
      if (!revisedAnswer) throw new Error("Напишите исправленный ответ.");
      await api.revise(existing.id, { revisedAnswer });
    } else {
      const answers = Object.fromEntries(steps.map(([key]) => [key, form.elements[key].value.trim()]));
      await api.submit({ workId, assignmentId: assignments.find(item => item.work_id === workId)?.id || null, character: selectedCharacter(form), excerpt: form.elements.excerpt.value.trim(), answers, initialAnswer: Object.values(answers).join("\n\n"), revisedAnswer: form.elements.revised.value.trim() || null, helpUsed: [...form.querySelectorAll("[data-hint-box]")].some(box => !box.classList.contains("hidden")) });
    }
    message.textContent = existing ? "Исправленный ответ сохранён." : "Работа сохранена. Учитель увидит обе версии."; message.className = "form-message success";
  } catch (error) { message.textContent = error.message; message.className = "form-message error"; }
  finally { button.disabled = false; }
}

const selectedCharacter = form => form.elements.character.value || form.elements.customCharacter.value.trim();

async function init() {
  if (!getToken()) { location.replace("index.html"); return; }
  if (!workId) { location.replace("student-library.html"); return; }
  try {
    const [{ user }, library, assignmentData, submissions] = await Promise.all([api.me(), api.library(), api.assignments(), api.submissions()]);
    if (user.role !== "student") { location.replace("teacher-overview.html"); return; }
    work = library.items.find(item => item.id === workId);
    if (!work) throw new Error("Произведение не найдено.");
    assignments = assignmentData.items;
    const existing = existingSubmissionId ? submissions.items.find(item => item.id === existingSubmissionId && item.work_id === workId) : null;
    render(user, existing);
  } catch (error) {
    if (error.status === 401) { setToken(null); location.replace("index.html"); return; }
    shell.innerHTML = `<main class="standalone-error"><div class="error-banner">${escapeHtml(error.message)}</div><a class="button ghost button-link" href="student-library.html">К библиотеке</a></main>`;
  }
}

init();
