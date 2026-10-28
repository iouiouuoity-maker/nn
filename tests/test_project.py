import json
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ProjectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.works = json.loads((ROOT / "data" / "works.json").read_text(encoding="utf-8"))
        cls.excluded = json.loads((ROOT / "data" / "excluded.json").read_text(encoding="utf-8"))

    def test_library_has_unique_verified_ids(self):
        ids = [work["id"] for work in self.works]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(work["verified"] is True for work in self.works))
        self.assertTrue(all(work["part"] in (1, 2) for work in self.works))

    def test_astafyev_and_unverified_example_not_seeded(self):
        joined = json.dumps(self.works, ensure_ascii=False).lower()
        self.assertNotIn("астаф", joined)
        self.assertNotIn("конь с розовой гривой", joined)
        excluded = json.dumps(self.excluded, ensure_ascii=False).lower()
        self.assertIn("белогрудка", excluded)
        self.assertIn("конь с розовой гривой", excluded)

    def test_required_textbook_works_are_present(self):
        titles = {work["title"] for work in self.works}
        required = {
            "Ворона и Лисица", "Хамелеон", "Солдатёнок", "Белый Бим Чёрное Ухо",
            "Сто лет тому вперёд", "Снежная королева", "Телефон", "Свеча горела"
        }
        self.assertTrue(required.issubset(titles))

    def test_schema_builds_and_seeds_11_students(self):
        connection = sqlite3.connect(":memory:")
        connection.executescript((ROOT / "worker" / "schema.sql").read_text(encoding="utf-8"))
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM students").fetchone()[0], 11)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM works WHERE active = 1").fetchone()[0], len(self.works))
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM works WHERE author LIKE '%Астафьев%'").fetchone()[0], 0)

    def test_no_plaintext_teacher_password(self):
        source = (ROOT / "worker" / "src" / "index.js").read_text(encoding="utf-8")
        self.assertIn('login !== "laila.teacher"', source)
        self.assertIn("TEACHER_PASSWORD_HASH", source)
        self.assertIn("pbkdf2", source)
        self.assertNotIn("laila.teacher123", source)

    def test_ai_prompt_requires_teacher_excerpt(self):
        source = (ROOT / "worker" / "src" / "index.js").read_text(encoding="utf-8")
        self.assertIn("ТОЛЬКО фрагмент", source)
        self.assertIn("не придумывай цитаты", source)
        self.assertIn("Не пиши готовый ответ", source)

    def test_required_interactive_modes_exist(self):
        source = (ROOT / "js" / "analysis.js").read_text(encoding="utf-8")
        for label in ("Диалог с героем", "Найди слабое место", "Два взгляда", "Что будет, если"):
            self.assertIn(label, source)

    def test_real_multipage_routes_exist(self):
        pages = {
            "index.html", "analysis.html",
            "student-library.html", "student-assignments.html", "student-workshop.html",
            "student-mistakes.html", "student-achievements.html",
            "teacher-overview.html", "teacher-assignments.html", "teacher-submissions.html",
            "teacher-difficulties.html", "teacher-students.html", "teacher-library.html",
        }
        self.assertTrue(all((ROOT / page).is_file() for page in pages))
        self.assertFalse((ROOT / "js" / "app.js").exists())


if __name__ == "__main__":
    unittest.main()
