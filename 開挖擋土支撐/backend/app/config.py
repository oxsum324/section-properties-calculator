from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        self.root_dir = Path(__file__).resolve().parents[2]
        self.app_data_dir = self.root_dir / "app_data"
        self.projects_dir = self.app_data_dir / "projects"
        self.reports_dir = self.app_data_dir / "reports"
        self.db_path = self.app_data_dir / "projects.db"
        default_workbook = self.root_dir / "2_開挖擋土支撐-v95000.xlsm"
        self.workbook_path = Path(os.environ.get("STRUT_WORKBOOK_PATH", default_workbook))
        default_word_template = self.root_dir / "一般(分析+擋土+支撐).docx"
        self.word_template_path = Path(
            os.environ.get("STRUT_WORD_TEMPLATE_PATH", default_word_template)
        )
        default_reference_overrides = self.app_data_dir / "reference_overrides.json"
        self.reference_overrides_path = Path(
            os.environ.get("STRUT_REFERENCE_OVERRIDES_PATH", default_reference_overrides)
        )
        self.frontend_dist_dir = self.root_dir / "frontend" / "dist"
        self.frontend_dev_url = os.environ.get("STRUT_FRONTEND_DEV_URL", "http://127.0.0.1:5173")
        self.sample_analysis_files = [
            self.root_dir / "1141015D6.LST",
            self.root_dir / "1150317.o",
        ]
        self.cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.app_data_dir.mkdir(parents=True, exist_ok=True)
    settings.projects_dir.mkdir(parents=True, exist_ok=True)
    settings.reports_dir.mkdir(parents=True, exist_ok=True)
    return settings
