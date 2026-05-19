from __future__ import annotations

from collections import Counter
import unittest
from pathlib import Path

from backend.app.parsers import parse_analysis_file
from backend.app.config import get_settings


class ParserTests(unittest.TestCase):
    def test_parse_lst_file(self) -> None:
        settings = get_settings()
        path = settings.root_dir / "1141015D6.LST"
        content = path.read_text(encoding="utf-8", errors="ignore")
        result = parse_analysis_file(path.name, content)
        self.assertGreaterEqual(len(result.stages), 2)
        self.assertGreaterEqual(sum(len(stage.struts) for stage in result.stages), 1)
        self.assertIsNotNone(result.excavation_depth_m)
        self.assertIsNotNone(result.ground_water_level_m)

    def test_parse_o_file(self) -> None:
        settings = get_settings()
        path = settings.root_dir / "1150317.o"
        content = path.read_text(encoding="utf-8", errors="ignore")
        result = parse_analysis_file(path.name, content)
        self.assertGreaterEqual(len(result.stages), 2)
        self.assertGreaterEqual(sum(len(stage.struts) for stage in result.stages), 1)
        self.assertIsNotNone(result.ground_water_level_m)

    def test_parse_annotated_o_file_distinguishes_support_floor_and_remove_events(self) -> None:
        settings = get_settings()
        path = settings.root_dir / "1120105.o"
        content = path.read_text(encoding="utf-8", errors="ignore")
        result = parse_analysis_file(path.name, content)
        counts = Counter(event.classification for event in result.events)

        self.assertEqual(result.project_title, "岡山大鵬九村")
        self.assertEqual(len(result.stages), 11)
        self.assertEqual(counts["support"], 3)
        self.assertEqual(counts["floor"], 3)
        self.assertEqual(counts["remove"], 3)
        self.assertEqual(sum(len(stage.struts) for stage in result.stages), 3)
        self.assertEqual(
            [event.butt_no for event in result.events if event.classification == "support"],
            [1, 2, 3],
        )
        self.assertEqual(
            [event.depth_m for event in result.events if event.classification == "support"],
            [1.2, 3.9, 6.3],
        )
        self.assertEqual(
            [round(event.load_t or 0.0, 1) for event in result.events if event.classification == "support"],
            [72.3, 99.5, 217.5],
        )


if __name__ == "__main__":
    unittest.main()
