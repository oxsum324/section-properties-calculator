from __future__ import annotations

import json
import shutil
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from .config import get_settings
from .schemas import ProjectListItem, ProjectState
from .workbook_loader import load_default_project


def _normalize_project_sources(project: ProjectState) -> ProjectState:
    looks_like_legacy_source_state = (
        project.top_analysis_source.mode == "unused"
        and project.bottom_analysis_source.mode == "unused"
        and not project.top_analysis_source.import_result.source_name
        and not project.bottom_analysis_source.import_result.source_name
    )

    if looks_like_legacy_source_state:
        if project.top_supports:
            project.top_analysis_source.mode = "manual"
        if project.bottom_supports:
            project.bottom_analysis_source.mode = "manual"

    if project.analysis_import.source_name:
        has_top_import = bool(project.top_analysis_source.import_result.source_name)
        has_bottom_import = bool(project.bottom_analysis_source.import_result.source_name)
        if not has_top_import and not has_bottom_import:
            if (
                project.calculation_options.include_top_supports
                and not project.calculation_options.include_bottom_supports
            ):
                project.top_analysis_source.mode = "import"
                project.top_analysis_source.import_result = project.analysis_import.model_copy(deep=True)
            elif (
                project.calculation_options.include_bottom_supports
                and not project.calculation_options.include_top_supports
            ):
                project.bottom_analysis_source.mode = "import"
                project.bottom_analysis_source.import_result = project.analysis_import.model_copy(deep=True)
    return project


class ProjectStore:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.settings.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.commit()

    def list_projects(self) -> list[ProjectListItem]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC"
            ).fetchall()
        return [
            ProjectListItem(
                id=row["id"],
                name=row["name"],
                updated_at=datetime.fromisoformat(row["updated_at"]) if row["updated_at"] else None,
            )
            for row in rows
        ]

    def create_project(self, name: str) -> ProjectState:
        project = _normalize_project_sources(load_default_project().model_copy(deep=True))
        now = datetime.now()
        project_id = uuid.uuid4().hex[:12]
        project.metadata.id = project_id
        project.metadata.name = name
        project.metadata.created_at = now
        project.metadata.updated_at = now
        project_dir = self.settings.projects_dir / project_id
        project_dir.mkdir(parents=True, exist_ok=True)
        state_path = project_dir / "state.json"
        state_path.write_text(project.model_dump_json(indent=2), encoding="utf-8")
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO projects (id, name, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (project_id, name, str(state_path), now.isoformat(), now.isoformat()),
            )
            connection.commit()
        return project

    def get_project(self, project_id: str) -> ProjectState:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT file_path FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
        if row is None:
            raise KeyError(project_id)
        state_path = Path(row["file_path"])
        payload = json.loads(state_path.read_text(encoding="utf-8"))
        return _normalize_project_sources(ProjectState.model_validate(payload))

    def save_project(self, project: ProjectState) -> ProjectState:
        if not project.metadata.id:
            raise ValueError("專案尚未建立 ID")
        project = _normalize_project_sources(project)
        project.metadata.updated_at = datetime.now()
        with self._connect() as connection:
            row = connection.execute(
                "SELECT file_path FROM projects WHERE id = ?", (project.metadata.id,)
            ).fetchone()
        if row is None:
            raise KeyError(project.metadata.id)
        state_path = Path(row["file_path"])
        state_path.write_text(project.model_dump_json(indent=2), encoding="utf-8")
        with self._connect() as connection:
            connection.execute(
                "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
                (project.metadata.name, project.metadata.updated_at.isoformat(), project.metadata.id),
            )
            connection.commit()
        return project

    def project_dir(self, project_id: str) -> Path:
        return self.settings.projects_dir / project_id

    def save_imported_file(self, project_id: str, filename: str, data: bytes) -> Path:
        project_dir = self.project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        target = project_dir / filename
        target.write_bytes(data)
        return target

    def save_report(self, project_id: str, source_path: Path, latest_name: str = "latest-report.pdf") -> Path:
        project_dir = self.project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        target = project_dir / latest_name
        shutil.copyfile(source_path, target)
        return target
