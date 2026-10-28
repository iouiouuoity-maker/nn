import { isConfigured } from "./config.js";
import { api, getToken, setToken } from "./api.js";

const el = id => document.getElementById(id);

function message(text = "", kind = "") {
  el("loginMessage").textContent = text;
  el("loginMessage").className = `form-message ${kind}`;
}

function requireConfigured() {
  if (isConfigured()) return true;
  message("Сначала укажите адрес Worker в js/config.js. Без сервера защищённый вход не выполняется.", "error");
  return false;
}

function goToCabinet(role) {
  location.href = role === "teacher" ? "teacher-overview.html" : "student-library.html";
}

document.querySelectorAll("[data-role-tab]").forEach(button => button.addEventListener("click", () => {
  const role = button.dataset.roleTab;
  document.querySelectorAll("[data-role-tab]").forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  el("studentLoginPanel").classList.toggle("hidden", role !== "student");
  el("teacherLoginPanel").classList.toggle("hidden", role !== "teacher");
  message();
}));

el("studentLoginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireConfigured()) return;
  const button = event.currentTarget.querySelector("button");
  button.disabled = true; message("Проверяем код…");
  try {
    const data = await api.studentLogin(new FormData(event.currentTarget).get("code"));
    setToken(data.token); goToCabinet(data.user.role);
  } catch (error) { message(error.message, "error"); }
  finally { button.disabled = false; }
});

el("teacherLoginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireConfigured()) return;
  const values = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button");
  button.disabled = true; message("Проверяем логин и пароль…");
  try {
    const data = await api.teacherLogin(values.get("login"), values.get("password"));
    setToken(data.token); goToCabinet(data.user.role);
  } catch (error) { message(error.message, "error"); }
  finally { button.disabled = false; }
});

async function init() {
  const badge = el("connectionBadge");
  if (!isConfigured()) return;
  try { await api.health(); badge.textContent = "Сервер подключён"; badge.classList.add("online"); }
  catch { badge.textContent = "Сервер недоступен"; }
  if (!getToken()) return;
  try { const { user } = await api.me(); goToCabinet(user.role); }
  catch { setToken(null); }
}

init();
