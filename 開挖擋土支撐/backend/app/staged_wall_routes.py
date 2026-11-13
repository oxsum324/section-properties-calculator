from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .staged_wall import WallCase, calculate

router = APIRouter(prefix="/api/staged-wall")
assets = Path(__file__).with_name("staged_wall_ui")


@router.get("/", include_in_schema=False)
def workpage():
    return FileResponse(assets / "index.html", media_type="text/html")


@router.get("/workspace.js", include_in_schema=False)
def workspace_script():
    return FileResponse(assets / "workspace.js", media_type="application/javascript")


@router.post("/calculate")
def analyze_wall(case: WallCase):
    try:
        return calculate(case)
    except (ValueError, ArithmeticError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
