from __future__ import annotations

import unittest
from zipfile import ZipFile

from docx import Document
from pypdf import PdfReader

from backend.app.calculations import calculate_project
from backend.app.reporting import _concise_metric_text, build_report, build_word_report
from backend.app.workbook_loader import load_default_project


class ReportingTests(unittest.TestCase):
    _default_word_artifact: dict[str, object] | None = None

    @classmethod
    def tearDownClass(cls) -> None:
        artifact = cls._default_word_artifact or {}
        report_path = artifact.get("path")
        if report_path is not None:
            report_path.unlink(missing_ok=True)

    @classmethod
    def default_word_artifact(cls) -> dict[str, object]:
        if cls._default_word_artifact is None:
            project = load_default_project().model_copy(deep=True)
            project.calculation_results = calculate_project(project)
            report_path = build_word_report(project, concise_mode=False)
            document = Document(str(report_path))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
            table_text = "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
            section = document.sections[0]
            header_text = "\n".join(paragraph.text for paragraph in section.header.paragraphs)
            footer_text = "\n".join(paragraph.text for paragraph in section.footer.paragraphs)
            first_page_header_text = "\n".join(paragraph.text for paragraph in section.first_page_header.paragraphs)
            first_page_footer_text = "\n".join(paragraph.text for paragraph in section.first_page_footer.paragraphs)
            with ZipFile(report_path) as archive:
                document_xml = archive.read("word/document.xml").decode("utf-8")
                footer_files = [name for name in archive.namelist() if name.startswith("word/footer")]
                footer_xml = "\n".join(archive.read(name).decode("utf-8") for name in footer_files)
            cls._default_word_artifact = {
                "project": project,
                "path": report_path,
                "document": document,
                "text": text,
                "table_text": table_text,
                "combined_text": text + "\n" + table_text,
                "section": section,
                "header_text": header_text,
                "footer_text": footer_text,
                "first_page_header_text": first_page_header_text,
                "first_page_footer_text": first_page_footer_text,
                "document_xml": document_xml,
                "footer_xml": footer_xml,
            }
        return cls._default_word_artifact

    def test_word_report_is_generated(self) -> None:
        report_path = self.default_word_artifact()["path"]

        self.assertTrue(report_path.exists())
        self.assertEqual(report_path.suffix.lower(), ".docx")
        self.assertGreater(report_path.stat().st_size, 0)

    def test_word_report_includes_cover_title_and_project_metadata(self) -> None:
        combined_text = self.default_word_artifact()["combined_text"]

        self.assertIn("擋土支撐檢核計算書", combined_text)
        self.assertIn("工程名稱", combined_text)
        self.assertIn("工程位置", combined_text)
        self.assertIn("報告日期", combined_text)
        self.assertIn("內容提要", combined_text)
        self.assertIn("報告說明", combined_text)
        self.assertIn("六、結構計算結果", combined_text)

    def test_pdf_report_uses_formal_section_structure(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_results = calculate_project(project)

        report_path = build_report(project)
        reader = PdfReader(str(report_path))
        first_page_text = reader.pages[0].extract_text() or ""
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:4])

        self.assertIn("一、摘要", text)
        self.assertIn("二、設計依據", text)
        self.assertIn("三、結構分析使用之電腦程式", text)
        self.assertIn("四、材料性質", text)
        self.assertIn("五、輸入基本資料", text)
        self.assertIn("六、結構計算結果", text)
        self.assertIn("上、下層支撐資料均採手動輸入", text)
        self.assertIn("內容提要", text)
        self.assertIn("附件一", text)
        self.assertIn("主要控制項目彙整", text)
        self.assertEqual(first_page_text.count("擋土支撐檢核計算書"), 1)
        report_path.unlink(missing_ok=True)

    def test_word_report_adds_header_footer_page_number_and_appendix_page_breaks(self) -> None:
        artifact = self.default_word_artifact()
        project = artifact["project"]
        section = artifact["section"]
        header_text = artifact["header_text"]
        footer_text = artifact["footer_text"]
        first_page_header_text = artifact["first_page_header_text"]
        first_page_footer_text = artifact["first_page_footer_text"]

        self.assertTrue(section.different_first_page_header_footer)
        self.assertIn("擋土支撐檢核計算書", header_text)
        self.assertIn(project.metadata.name, header_text)
        self.assertEqual(first_page_header_text.strip(), "")
        self.assertIn("第", footer_text)
        self.assertIn("頁", footer_text)
        self.assertIn("第", first_page_footer_text)
        self.assertIn("頁", first_page_footer_text)

        self.assertIn('w:type="page"', artifact["document_xml"])
        self.assertIn("PAGE", artifact["footer_xml"])

    def test_single_side_word_report_uses_generic_source_label(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_options.include_bottom_supports = False
        project.calculation_results = calculate_project(project)

        report_path = build_word_report(project)
        document = Document(str(report_path))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        table_text = "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)

        self.assertIn("支撐來源", text + "\n" + table_text)
        self.assertNotIn("上層來源", table_text)
        report_path.unlink(missing_ok=True)

    def test_word_report_summary_marks_section_names(self) -> None:
        artifact = self.default_word_artifact()
        project = artifact["project"]
        expected_section = next(
            (item.section_name for item in project.calculation_results.summary if item.section_name),
            "",
        )

        table_text = artifact["table_text"]

        self.assertTrue(expected_section)
        self.assertIn("型號：", table_text)
        self.assertIn(expected_section, table_text)

    def test_word_report_includes_appendix_sections_with_detail_checks(self) -> None:
        artifact = self.default_word_artifact()
        project = artifact["project"]
        support_label = project.calculation_results.support_checks[0].label
        column_label = project.calculation_results.column_checks[0].label

        combined_text = artifact["combined_text"]

        self.assertIn("附件一：支撐、橫擋、斜撐、大角撐細部計算結果", combined_text)
        self.assertIn("附件二：中間柱、共構柱細部計算結果", combined_text)
        self.assertIn("一、摘要", combined_text)
        self.assertIn("六、結構計算結果", combined_text)
        self.assertIn("內容提要", combined_text)
        self.assertIn("報告說明", combined_text)
        self.assertIn("設計規範與檢核依據", combined_text)
        self.assertIn("附件一", combined_text)
        self.assertIn("細部計算過程與檢核結果", combined_text)
        self.assertIn("附件一共用參數", combined_text)
        self.assertIn("附件二共用參數", combined_text)
        self.assertIn("附件一型鋼彙整表", combined_text)
        self.assertIn("附件二型鋼彙整表", combined_text)
        self.assertIn("支撐示意圖", combined_text)
        self.assertIn("檢核結論", combined_text)
        self.assertIn("納入檢討構件", combined_text)
        self.assertIn("整體判定", combined_text)
        self.assertIn("最不利構件", combined_text)
        self.assertIn("控制條件", combined_text)
        self.assertIn("最大利用率", combined_text)
        self.assertIn("應注意", combined_text)
        self.assertIn("支撐計算如下", combined_text)
        self.assertIn("檢核結果統計", combined_text)
        self.assertIn("橫檔計算如下", combined_text)
        self.assertIn("斜撐計算如下", combined_text)
        self.assertIn("大角撐計算如下", combined_text)
        self.assertLess(combined_text.find("附件一型鋼彙整表"), combined_text.find("支撐示意圖"))
        self.assertLess(combined_text.find("支撐示意圖"), combined_text.find("支撐計算如下"))
        self.assertIn(support_label, combined_text)
        self.assertIn(column_label, combined_text)
        self.assertIn("已知條件", combined_text)
        self.assertIn("斷面資料", combined_text)
        self.assertIn("檢核公式", combined_text)
        self.assertIn("代入計算", combined_text)
        self.assertIn("Fa 依 KL/r 與 Cc 之關係", combined_text)
        self.assertIn("本案 KL/r =", combined_text)
        self.assertIn("詳前述「附件一型鋼彙整表」", combined_text)
        self.assertIn("詳前述「附件二型鋼彙整表」", combined_text)
        self.assertIn("本節檢核摘要", combined_text)
        self.assertIn("構件名稱", combined_text)
        self.assertIn("判定統計", combined_text)
        self.assertIn("編排原則", combined_text)
        self.assertIn("Qc,allow", combined_text)
        self.assertIn("Qt,allow", combined_text)
        self.assertIn("壓入比 =", combined_text)
        self.assertIn("拉拔比 =", combined_text)
        self.assertIn("積載重 WL", combined_text)
        self.assertIn("構件折減係數 αs / αw / αb", combined_text)
        self.assertIn("柱構件折減係數 αp", combined_text)
        self.assertIn("上、下層支撐資料均採手動輸入", combined_text)
        self.assertIn("本案未匯入外部分析檔，支撐軸力、土層及施工階段資料均以人工整理後之輸入內容作為後續構件檢核之依據。", combined_text)
        self.assertIn("上層第 1 層", combined_text)
        self.assertIn("下層第 1 層", combined_text)
        self.assertLess(combined_text.find("上層第 1 層"), combined_text.find("下層第 1 層"))
        self.assertNotIn("附件一彙整表", combined_text)
        self.assertNotIn("附件二彙整表", combined_text)
        self.assertNotIn("條文索引 / 符號說明", combined_text)
        self.assertNotIn("利用率 0.", combined_text)
        self.assertNotIn("引用參考小工具", combined_text)
        self.assertNotIn("allowable_axial_stress", combined_text)
        self.assertNotIn("allowable_fbx", combined_text)
        self.assertNotIn("採用型號：", combined_text)
        self.assertNotIn("若 KL/r < Cc", combined_text)
        self.assertNotIn("若 KL/r >=", combined_text)
        self.assertNotIn("控制值 / 允許值 =", combined_text)
        self.assertNotIn("橫擋 / 斜撐示意圖", combined_text)
        self.assertNotIn("本節適用規範", combined_text)
        self.assertNotIn("Say~OK", combined_text)

    def test_word_report_concise_mode_summarizes_following_checks(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_results = calculate_project(project)

        report_path = build_word_report(project, concise_mode=True)
        document = Document(str(report_path))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        table_text = "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
        combined_text = text + "\n" + table_text

        self.assertIn("本節檢核摘要", combined_text)
        self.assertIn("首筆列示完整驗算過程，其餘摘列關鍵值與判定", combined_text)
        self.assertIn("關鍵數值", combined_text)
        self.assertIn("檢核公式：", combined_text)
        self.assertLess(combined_text.count("檢核公式："), 10)
        self.assertIn("-concise-", report_path.name)
        report_path.unlink(missing_ok=True)

    def test_word_report_detailed_mode_keeps_full_detail(self) -> None:
        artifact = self.default_word_artifact()
        report_path = artifact["path"]
        combined_text = artifact["combined_text"]

        self.assertNotIn("本節採簡述版：首筆詳算，其餘僅列關鍵值與檢核結果。", combined_text)
        self.assertNotIn("其餘項目關鍵摘要", combined_text)
        self.assertGreater(combined_text.count("檢核公式："), 20)
        self.assertIn("附件編排方式", combined_text)
        self.assertIn("詳細版（逐筆列示完整驗算過程）", combined_text)
        self.assertIn("-detail-", report_path.name)

    def test_word_report_hides_non_included_structural_modules(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_options.include_top_wales = False
        project.calculation_options.include_bottom_wales = False
        project.calculation_options.include_top_braces = False
        project.calculation_options.include_bottom_braces = False
        project.calculation_options.include_corner_braces = False
        project.calculation_results = calculate_project(project)

        report_path = build_word_report(project, concise_mode=False)
        document = Document(str(report_path))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        table_text = "\n".join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
        combined_text = text + "\n" + table_text

        self.assertIn("附件一：支撐細部計算結果", combined_text)
        self.assertNotIn("附件一：支撐、橫擋", combined_text)
        self.assertNotIn("橫檔計算如下", combined_text)
        self.assertNotIn("斜撐計算如下", combined_text)
        self.assertNotIn("大角撐計算如下", combined_text)
        self.assertNotIn("層別\n水平支撐\n橫擋", table_text)
        self.assertNotIn("層別\n水平支撐\n斜撐", table_text)
        self.assertNotIn("層別\n水平支撐\n大角撐", table_text)
        report_path.unlink(missing_ok=True)

    def test_word_report_uses_compact_manual_analysis_rows(self) -> None:
        table_text = self.default_word_artifact()["table_text"]

        self.assertIn("資料說明", table_text)
        self.assertIn("本案未匯入外部分析檔，後續檢核以手動輸入資料為準。", table_text)
        self.assertNotIn("來源檔案\n—", table_text)
        self.assertNotIn("來源格式\n—", table_text)

    def test_concise_metric_text_uses_multiline_layout(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_results = calculate_project(project)

        text = _concise_metric_text(project.calculation_results.support_checks[0])

        self.assertIn("\n", text)
        self.assertIn("交互作用比 R =", text)


if __name__ == "__main__":
    unittest.main()
