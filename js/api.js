import { CONFIG } from "./config.js";

const TOKEN_KEY = "hero360.session";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${CONFIG.API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ error: "Сервер вернул непонятный ответ" }));
  if (!response.ok) {
    const error = new Error(data.error || `Ошибка ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  me: () => request("/api/me"),
  teacherLogin: (login, password) => request("/api/auth/teacher", { method: "POST", body: JSON.stringify({ login, password }) }),
  studentLogin: code => request("/api/auth/student", { method: "POST", body: JSON.stringify({ code }) }),
  library: () => request("/api/library"),
  assignments: () => request("/api/assignments"),
  submissions: () => request("/api/submissions"),
  submit: payload => request("/api/submissions", { method: "POST", body: JSON.stringify(payload) }),
  revise: (id, payload) => request(`/api/submissions/${encodeURIComponent(id)}/revision`, { method: "PUT", body: JSON.stringify(payload) }),
  hint: payload => request("/api/ai/hint", { method: "POST", body: JSON.stringify(payload) }),
  dialogue: payload => request("/api/ai/dialogue", { method: "POST", body: JSON.stringify(payload) }),
  overview: () => request("/api/teacher/overview"),
  teacherStudents: () => request("/api/teacher/students"),
  resetStudentCode: (id, code) => request(`/api/teacher/students/${encodeURIComponent(id)}/code`, { method: "PUT", body: JSON.stringify({ code }) }),
  teacherSubmissions: () => request("/api/teacher/submissions"),
  createAssignment: payload => request("/api/teacher/assignments", { method: "POST", body: JSON.stringify(payload) }),
  reviewSubmission: (id, payload) => request(`/api/teacher/submissions/${encodeURIComponent(id)}/review`, { method: "PUT", body: JSON.stringify(payload) }),
  createWork: payload => request("/api/teacher/works", { method: "POST", body: JSON.stringify(payload) })
};
