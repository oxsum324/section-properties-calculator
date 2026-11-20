import copy
import json
from pathlib import Path
import unittest

from backend.app.staged_wall import WallCase, calculate


FIXTURE = json.loads((Path(__file__).parent/"fixtures"/"staged_wall_reference.json").read_text(encoding="utf8"))


class StagedWallTests(unittest.TestCase):
    def setUp(self):
        self.data = copy.deepcopy(FIXTURE["input"])

    def solve(self):
        return calculate(WallCase.model_validate(self.data))["stages"]

    def test_five_stages_against_matrix_exponential(self):
        for stage, ref in zip(self.solve(), FIXTURE["reference"]["stages"], strict=True):
            self.assertLess(abs(stage["balance"]["force_error"]),1e-6)
            self.assertLess(abs(stage["balance"]["moment_error"]),1e-5)
            for node, known in zip(stage["wall"],ref["points"],strict=True):
                self.assertAlmostEqual(node["z"],known["z"])
                side = "above" if node["z"]==12 else "below"
                self.assertAlmostEqual(node["u_mm"],1000*known["uM"],delta=1e-5)
                self.assertAlmostEqual(node["M_"+side],known["momentKnMPerM"],delta=6e-5)
                self.assertAlmostEqual(node["V_"+side],known["shearKnPerM"],delta=6e-5)
            self.assertAlmostEqual(sum(s["per_m"] for s in stage["supports"]),ref["supportReactionKnPerM"],delta=3e-6)

    def test_cantilever_patch_and_toe(self):
        self.data.update(supports=[],stages=self.data["stages"][:1])
        self.data["stages"][0].update(cut=12,water_factor=0)
        for layer in self.data["layers"]:
            layer.update(pressure_top=10,pressure_bottom=10)
        s=self.solve()[0]
        self.assertAlmostEqual(s["wall"][0]["u_mm"],1000*10*12**4/(8*210000),delta=1e-5)
        self.assertAlmostEqual(s["wall"][-1]["M_above"],720,delta=1e-5)
        self.assertAlmostEqual(s["wall"][-1]["V_above"],120,delta=1e-5)
        self.data["toe"]="free"
        with self.assertRaisesRegex(ValueError,"失穩|剛度"):
            self.solve()

    def test_staged_water_profiles_drive_load_and_toe_reactions(self):
        self.data.update(supports=[], comparisons=[], step=2.9, stages=self.data["stages"][:2])
        outside = dict(basis="外側合成壓力", points=[
            dict(depth=2, pressure=0), dict(depth=5, pressure=30), dict(depth=12, pressure=44),
        ])
        inside = dict(basis="內側合成壓力", points=[
            dict(depth=4, pressure=0), dict(depth=7, pressure=24), dict(depth=12, pressure=50),
        ])
        self.data["stages"][0].update(cut=12, outside_water=None, inside_water=None, earth_factor=0,
                                    water_factor=.75, outside_water_profile=outside, inside_water_profile=inside)
        self.data["stages"][1].update(cut=12, outside_water=None, inside_water=4, earth_factor=0,
                                    water_factor=1, outside_water_profile=outside)
        case = WallCase.model_validate(self.data)
        result = calculate(case)
        for stage in (result["stages"][0], result["coarse"][0]):
            self.assertTrue({2, 4, 5, 7, 12} <= {point["z"] for point in stage["wall"]})
            # Net pressures at the breakpoints are 0, 20, 22, 10, -6 kPa before scaling.
            self.assertAlmostEqual(stage["balance"]["water_force"], 62.25, places=8)
            self.assertAlmostEqual(stage["balance"]["water_moment_at_ground"], 308.25, places=8)
            self.assertAlmostEqual(stage["wall"][-1]["M_above"], 438.75, places=6)
            self.assertAlmostEqual(stage["wall"][-1]["V_above"], 62.25, places=6)
        mixed = result["stages"][1]
        self.assertAlmostEqual(mixed["balance"]["water_force"], -9.92, places=8)
        self.assertAlmostEqual(mixed["balance"]["water_moment_at_ground"], -491.2533333333, places=8)
        self.assertAlmostEqual(mixed["balance"]["applied"], -9.92, places=8)

    def test_invalid_water_profiles_fail_before_solving(self):
        stage = self.data["stages"][0]
        for points in (
            [(2, 1), (12, 30)],
            [(2, 0), (2, 10), (12, 30)],
            [(2, 0), (8, 30)],
            [(2, 0), (13, 30)],
            [(2, 0), (12, -1)],
            [(2, 0), (12, float("nan"))],
        ):
            with self.subTest(points=points):
                stage["outside_water_profile"] = dict(
                    basis="測試", points=[dict(depth=z, pressure=p) for z, p in points]
                )
                with self.assertRaises(ValueError):
                    self.solve()
        del stage["outside_water_profile"]
        stage["outside_water"] = None
        with self.assertRaisesRegex(ValueError, "外側水位"):
            self.solve()

    def test_plastic_history_and_reversal(self):
        self.data["soil_law"]="plastic"
        for l in self.data["layers"]:l.update(lower=-35,upper=55)
        stages=self.solve()
        p=stages[-2]["springs"];unload=stages[-1]["springs"]
        self.assertGreater(max(q["plastic_m"] for e in p for q in e),.09)
        elastic_unloads=0
        for e,f in zip(p,unload):
            for a,b in zip(e,f):
                self.assertGreaterEqual(b["spring_kpa"],-35)
                self.assertLessEqual(b["spring_kpa"],55)
                if b["active"] and -35<b["spring_kpa"]<55 and a["plastic_m"]>.001:
                    self.assertAlmostEqual(a["plastic_m"],b["plastic_m"])
                    kh=6200 if b["z"]<6 else 12500
                    self.assertAlmostEqual(b["spring_kpa"]-a["spring_kpa"],kh*(b["u_m"]-a["u_m"]),delta=1e-7)
                    elastic_unloads+=1
        self.assertGreater(elastic_unloads,0)
        self.assertFalse(any(q["active"] for e in unload for q in e if q["z"]<6))

    def test_compression_only_support_releases_on_unload(self):
        self.data["stages"]=self.data["stages"][:2]
        self.data["stages"][1].update(earth_factor=0,water_factor=0)
        self.data["supports"][0].update(preload=0,law="compression",remove=None)
        s=self.solve()[-1]["supports"][0]
        self.assertEqual(s["force_kn"],0)
        self.assertTrue(s["gap"])

    def test_external_measurement_side_and_missing_reaction(self):
        def rec(st,q,unit,val,z=2,side="below",support=None):
            return dict(stage=st,depth=z,kind="measurement",quantity=q,unit=unit,value=val,side=side,support=support,source="合成測點 P")
        self.data["comparisons"]=[rec("S3","u","cm",1.9,0),rec("S3","V","tf/m",.1,side="above"),rec("S3","V","tf/m",.1),
                                  rec("S3","R","tf",20,support="B1"),rec("S4","R","kN",0,support="B1")]
        res=self.solve();u,upper,lower,force=res[2]["comparisons"]
        self.assertEqual(u["converted"],19)
        self.assertAlmostEqual(u["delta"],18.64502-19,delta=1e-5)
        self.assertAlmostEqual(upper["calc"]-lower["calc"],force["calc"]/2,delta=1e-6)
        self.assertAlmostEqual(force["converted"],196.133)
        self.assertIsNone(res[3]["comparisons"][0]["delta"])
        self.data["comparisons"][0]["stage"]="missing"
        with self.assertRaises(ValueError):self.solve()


if __name__=="__main__":
    unittest.main()
