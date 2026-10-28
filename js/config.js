export const CONFIG = Object.freeze({
API_BASE: "https://hidden-paper-1bdf.vp5vy7g7db.workers.dev",
  TEACHER_LOGIN: "laila.teacher",
  TEXTBOOK: "Атамұра · Русский язык и литература · 6 класс · Я2 · 2018",
  CRITERIA: ["emotion", "motive", "evidence", "perspective", "consequence"]
});

export function isConfigured() {
  return !CONFIG.API_BASE.includes("YOUR-WORKER");
}
