"""Synthetic Excel and analysis streams for the clean-checkout test command."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from openpyxl import Workbook


FIXTURE_ENV = "STRUT_TEST_FIXTURE_DIR"
SYNTHETIC_TITLE = "開挖施工階段合成案例"


def analysis_sample_path(name: str) -> Path:
    folder = os.environ.get(FIXTURE_ENV)
    root = Path(folder) if folder else Path(__file__).resolve().parents[2]
    return root / name


def build_workbook(path: Path) -> None:
    source = Path(__file__).parent / "fixtures" / "reshore_biaxial_independent_benchmark.json"
    steel = json.loads(source.read_text(encoding="utf-8"))["section"]
    section = steel["name"]
    area = steel["areaCm2"]
    rx, ry = steel["rxCm"], steel["ryCm"]
    wb = Workbook()
    shape = wb.active
    shape.title = "H"
    data = (1, section, None, steel["depthCm"] * 10, steel["flangeWidthCm"] * 10,
            steel["webThicknessCm"] * 10, steel["flangeThicknessCm"] * 10, None,
            area, area * 0.785, area * rx**2, area * ry**2, rx, ry, steel["rtCm"],
            steel["sxCm3"], steel["syCm3"], 1500, 520)
    for column, value in enumerate(data, 1):
        shape.cell(row=3, column=column, value=value)

    bolts = wb.create_sheet("bolt")
    for header in (4, 12):
        bolts.cell(row=header, column=4, value="M20")
        for row, grade in enumerate(("A307", "A325", "A490"), header + 1):
            for column, value in enumerate((grade, 1.5, 4.0), 2):
                bolts.cell(row=row, column=column, value=value)

    basic = wb.create_sheet("基本參數")
    for address, value in {
        "C15": 2040, "C16": 2.5, "C18": 1, "C19": 0, "C20": 1, "C21": 1,
        "C22": 1, "C23": 1, "C24": 1, "C77": "連續壁", "D78": 60, "D79": 280,
    }.items():
        basic[address] = value

    design = wb.create_sheet("各項設計參數")
    # The receiver benchmarks specify a 106 tf test demand (76 tf + 30 tf).
    for row, values in (
        (5, ("S1", 1, section, 76, 30, 5)), (19, ("S1", 1, section, 90, 20, 5)),
        (33, ("S1", 1, section, None, section, 4, 1, 45)),
        (48, ("S1", 1, section, None, section, 4, 1, 45)),
    ):
        for column, value in enumerate(values, 1):
            design.cell(row=row, column=column, value=value)
    wb.create_sheet("大角撐")
    soil = wb.create_sheet("Soil")
    for column, value in enumerate((1, "S1", 20, 20, 20), 2):
        soil.cell(row=3, column=column, value=value)
    for title in ("中間柱", "共構柱 (一般)", "共構柱 (大吊車)"):
        wb.create_sheet(title)["C2"] = section
    wb.save(path)
    wb.close()


def build_analysis_samples(folder: Path) -> None:
    lst = "\n".join((
        "DATA FILE NAME : SYNTHETIC", "GROUND WATER LEVEL = 3.0 M", "EXCAVATION DEPTH 5.0 M",
        "* Stage 1 Excavation Depth= 2.5 m", ": EXC(2) 2.5",
        "* Stage 2 Install support", ": BUT(1) 1.2 5 0 -50 100",
    ))
    (folder / "1141015D6.LST").write_text(lst, encoding="utf-8")

    def setup(index: int, depth: float, force: float, label: str = "") -> str:
        return f"BUT(0) LEVEL-SPAN-DEGREE-LOAD-STIFFNESS = {depth} 5 0 {-force} 100 BUT NO. {index} {label}"

    def remove(index: int, depth: float) -> str:
        return f"BUT(0) LEVEL-SPAN = {depth} 5 *** REMOVED BUT NO. {index}"

    header = ["LIST OF INPUT DATA", SYNTHETIC_TITLE, "INITIAL GROUND WATER LEVEL = 3.0"]
    simple = [*header, "*** PHASE NO. 1", "EXC(2) EXCAVATION LEVEL = 2.5", "*** PHASE NO. 2", setup(1, 1.2, 50)]
    (folder / "1150317.o").write_text("\n".join(simple), encoding="utf-8")

    stage_actions = {
        2: [setup(1, 1.2, 50)], 4: [setup(2, 3.9, 70)], 6: [setup(3, 6.3, 160)],
        8: [setup(4, 7, 0, "FLOOR")],
        9: [setup(5, 5, 0, "FLOOR"), remove(2, 3.9), remove(3, 6.3)],
        11: [setup(6, 2, 0, "FLOOR"), remove(1, 1.2)],
    }
    forces = (
        "NO. 1 1.2 5 - -50 -58.7 -56.1 -52 -54.4 -52.1 -52.1 -72.3 -72.3 -",
        "NO. 2 3.9 5 - - - -70 -99.5 -85 -80.7 -80.7 - - -",
        "NO. 3 6.3 5 - - - - - -160 -217.5 -217.5 - - -",
    )
    annotated = list(header)
    for stage in range(1, 12):
        annotated.append(f"*** PHASE NO. {stage}")
        annotated.extend(stage_actions.get(stage, ()))
    annotated.extend(("Summary of BUT forces of All Phases with Envelope", *forces))
    (folder / "1120105.o").write_text("\n".join(annotated), encoding="utf-8")


def main() -> None:
    with TemporaryDirectory(prefix="excavation-ci-inputs-") as temp:
        folder = Path(temp)
        workbook = folder / "synthetic-reference.xlsx"
        build_workbook(workbook)
        build_analysis_samples(folder)
        os.environ.update({FIXTURE_ENV: str(folder), "STRUT_WORKBOOK_PATH": str(workbook),
                           "STRUT_DB_PATH": str(folder / "projects.db"),
                           "STRUT_REFERENCE_OVERRIDES_PATH": str(folder / "overrides.json")})
        font = os.environ.get("STRUT_TEST_CJK_FONT")
        if font:
            from backend.app import receiver_capacity_attachment
            receiver_capacity_attachment._PDF_FONT_CANDIDATES = (Path(font),)
        print("Excavation CI fixture: synthetic workbook and three analysis streams", flush=True)
        unittest.main(module=None, argv=[sys.argv[0], *sys.argv[1:]])


if __name__ == "__main__":
    main()
