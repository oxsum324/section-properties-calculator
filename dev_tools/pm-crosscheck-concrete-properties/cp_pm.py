"""RC 柱 P-M 離線交叉驗證：concrete-properties 端（只呼叫外部套件，未複製或修改其原始碼）。
單位 N、mm。鋼筋座標直接取自小工具 getRebarPositions 的輸出（out_tool.json），確保幾何一致。
用法：python cp_pm.py <輸出資料夾>"""
import json, math, pathlib, sys, warnings
warnings.filterwarnings("ignore")
from sectionproperties.pre.library.primitive_sections import rectangular_section
from concreteproperties.material import Concrete, SteelBar
from concreteproperties.stress_strain_profile import ConcreteLinear, RectangularStressBlock, SteelElasticPlastic
from concreteproperties.pre import add_bar
from concreteproperties.concrete_section import ConcreteSection

OUT = pathlib.Path(sys.argv[1]).resolve()
tool = json.loads((OUT / "out_tool.json").read_text(encoding="utf-8"))
N_CIRCLE = 32  # 鋼筋以 32 點多邊形離散，面積依 As 縮放
res = {}
for cid, t in tool.items():
    cs = t["input"]; b, h = cs["b"], cs["h"]
    conc = Concrete(name="fc", density=2.4e-6,
        stress_strain_profile=ConcreteLinear(elastic_modulus=4700 * math.sqrt(cs["fc"])),
        ultimate_stress_strain_profile=RectangularStressBlock(
            compressive_strength=cs["fc"], alpha=0.85, gamma=cs["beta1"], ultimate_strain=0.003),
        flexural_tensile_strength=0.62 * math.sqrt(cs["fc"]), colour="lightgrey")
    steel = SteelBar(name="fy", density=7.85e-6,
        stress_strain_profile=SteelElasticPlastic(yield_strength=cs["fy"], elastic_modulus=cs["Es"], fracture_strain=1.0),
        colour="grey")
    geom = rectangular_section(d=h, b=b, material=conc)
    for p in t["positions"]:
        geom = add_bar(geometry=geom, area=p["ab"], material=steel, x=p["x"], y=h - p["y"], n=N_CIRCLE)
    sec = ConcreteSection(geom)
    def at(c):
        r = sec.calculate_ultimate_section_actions(d_n=c)
        return dict(c=c, P=r.n / 1e3, M=r.m_x / 1e6)  # kN、kN·m（m_x 正值＝上緣受壓）
    cb = 0.003 * t["dt"] / (0.003 + t["epsTy"])  # 平衡點，dt 同小工具
    lo, hi = 1e-3 * h, h                          # 純彎：二分 P = 0
    for _ in range(80):
        m = (lo + hi) / 2
        if at(m)["P"] > 0: hi = m
        else: lo = m
    mi = sec.moment_interaction_diagram(theta=0, n_points=60, progress_bar=False)
    pts = [dict(P=r.n / 1e3, M=r.m_x / 1e6, k_u=r.k_u) for r in mi.results]
    gp = sec.get_gross_properties()
    res[cid] = dict(
        Po_kN=max(p["P"] for p in pts),
        conc_area=gp.concrete_area,
        balanced=at(cb), pureBending=at((lo + hi) / 2),
        scan=[at(s["c"]) for s in t["scan"]],
        mid=pts)
    print(cid, "Po %.1f kN; bal P %.1f M %.1f; M0 %.1f c0 %.2f; Ac %.1f" % (
        res[cid]["Po_kN"], res[cid]["balanced"]["P"], res[cid]["balanced"]["M"],
        res[cid]["pureBending"]["M"], res[cid]["pureBending"]["c"], gp.concrete_area))
(OUT / "out_cp.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
