from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.config import get_settings
from backend.app.workbook_loader import load_reference_data, reset_reference_overrides, save_reference_data


class ReferenceDataTests(unittest.TestCase):
    def test_reference_data_override_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            override_path = Path(temp_dir) / "reference_overrides.json"
            with patch.dict(
                os.environ,
                {"STRUT_REFERENCE_OVERRIDES_PATH": str(override_path)},
                clear=False,
            ):
                get_settings.cache_clear()
                load_reference_data.cache_clear()

                base = load_reference_data()
                updated = base.model_copy(deep=True)
                updated.sections.append(
                    updated.sections[0].model_copy(update={"name": "RH700X300X13X24-CUSTOM"})
                )
                updated.bolts[0].grade = "A490-CUSTOM"

                save_reference_data(updated)
                reloaded = load_reference_data()

                self.assertEqual(reloaded.sections[-1].name, "RH700X300X13X24-CUSTOM")
                self.assertEqual(reloaded.bolts[0].grade, "A490-CUSTOM")

                restored = reset_reference_overrides()
                self.assertNotEqual(restored.bolts[0].grade, "A490-CUSTOM")
                self.assertFalse(override_path.exists())

        get_settings.cache_clear()
        load_reference_data.cache_clear()


if __name__ == "__main__":
    unittest.main()
