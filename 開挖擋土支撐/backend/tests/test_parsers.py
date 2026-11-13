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

    def test_lst_commands_override_comment_and_keep_distinct_actions(self) -> None:
        sample = "\n".join([
            "* Stage 3 Excavation Depth= 6.80 m", ": EXC(2) 5.8", ": EAU(2) 6.8",
            "* Stage 3 Remove strut", ": BUT(0, 1)", ": STOP",
            "* Stage 3 Excavation Depth= 6.80 m", "* Stage 3 Remove strut",
        ])
        result = parse_analysis_file("case.LST", sample)
        self.assertEqual([(s.index, s.excavation_depth_m, s.water_level_m) for s in result.stages],
                         [(3, 5.8, 6.8), (3, None, None)])
        self.assertNotEqual(result.stages[0].label, result.stages[1].label)
        self.assertTrue(any("EXC(2)" in warning for warning in result.warnings))
        self.assertEqual(len(result.events), 1)
        self.assertEqual(result.events[0].stage_label, result.stages[1].label)
        fallback = parse_analysis_file("note.rio", "* Stage 1 Excavtion Depth= 3.25 m")
        self.assertEqual(fallback.stages[0].excavation_depth_m, 3.25)

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
        self.assertEqual(
            [event.control_stage_indices for event in result.events if event.classification == "support"],
            [[9, 10], [5], [7, 8]],
        )
        support_events = [event for event in result.events if event.classification == "support"]
        self.assertEqual(
            [(case.stage_index, round(case.axial_force_t, 1)) for case in support_events[0].stage_force_cases],
            [(2, 50.0), (3, 58.7), (4, 56.1), (5, 52.0), (6, 54.4), (7, 52.1), (8, 52.1), (9, 72.3), (10, 72.3)],
        )
        self.assertEqual(
            [len(event.stage_force_cases) for event in support_events],
            [9, 5, 3],
        )


if __name__ == "__main__":
    unittest.main()
