/* core/materials/steel.js
 * 鋼材材料常數 + H 型鋼標準斷面資料庫 + AISC/台灣鋼構設計公式
 * 單位：cm, kgf (應力 kgf/cm²; 力 tf; 彎矩 tf·m)
 */
(function (global) {
  'use strict';
  const PI = Math.PI;

  // ── 材料常數 ──
  const ES = 2.04e6;  // kgf/cm²
  const G  = 0.785e6; // 剪力模數 kgf/cm²

  const FY_OPTIONS = [
    { label:'SS400 / A36',     Fy:2500, Fu:4100 },
    { label:'SM490 / A572-50', Fy:3500, Fu:4900 },
    { label:'SM520',           Fy:3600, Fu:5200 },
    { label:'SN490B',          Fy:3300, Fu:4900 },
  ];

  // ── 強度折減因數 φ (LRFD) 與安全因數 Ω (ASD) ──
  const PHI   = { flexure:0.90, shear:0.90, shearCompact:1.00, compress:0.90, tension:0.90, rupture:0.75 };
  const OMEGA = { flexure:1.67, shear:1.67, shearCompact:1.50, compress:1.67, tension:1.67, rupture:2.00 };

  // ── H 型鋼標準規格 (mm → 內部計算全部換 cm) ──
  // 每筆: { n:名稱, H,B,tw,tf,R (mm) }
  const H_SECTIONS_MM = [
    {g:'100×50',   s:[{n:'H100×50×5×7',H:100,B:50,tw:5,tf:7,R:8}]},
    {g:'100×100',  s:[{n:'H100×100×6×8',H:100,B:100,tw:6,tf:8,R:8}]},
    {g:'125×60',   s:[{n:'H125×60×6×8',H:125,B:60,tw:6,tf:8,R:8}]},
    {g:'125×125',  s:[{n:'H125×125×6.5×9',H:125,B:125,tw:6.5,tf:9,R:8}]},
    {g:'150×75',   s:[{n:'H150×75×5×7',H:150,B:75,tw:5,tf:7,R:8}]},
    {g:'150×100',  s:[{n:'H148×100×6×9',H:148,B:100,tw:6,tf:9,R:8}]},
    {g:'150×150',  s:[{n:'H150×150×7×10',H:150,B:150,tw:7,tf:10,R:8}]},
    {g:'175×90',   s:[{n:'H175×90×5×8',H:175,B:90,tw:5,tf:8,R:8}]},
    {g:'175×175',  s:[{n:'H175×175×7.5×11',H:175,B:175,tw:7.5,tf:11,R:13}]},
    {g:'200×100',  s:[{n:'H198×99×4.5×7',H:198,B:99,tw:4.5,tf:7,R:8},{n:'H200×100×5.5×8',H:200,B:100,tw:5.5,tf:8,R:8}]},
    {g:'200×150',  s:[{n:'H194×150×6×9',H:194,B:150,tw:6,tf:9,R:8}]},
    {g:'200×200',  s:[{n:'H200×200×8×12',H:200,B:200,tw:8,tf:12,R:13},{n:'*H200×204×12×12',H:200,B:204,tw:12,tf:12,R:13}]},
    {g:'250×125',  s:[{n:'H248×124×5×8',H:248,B:124,tw:5,tf:8,R:8},{n:'H250×125×6×9',H:250,B:125,tw:6,tf:9,R:8}]},
    {g:'250×175',  s:[{n:'H244×175×7×11',H:244,B:175,tw:7,tf:11,R:13}]},
    {g:'250×250',  s:[{n:'H250×250×9×14',H:250,B:250,tw:9,tf:14,R:13},{n:'*H250×255×14×14',H:250,B:255,tw:14,tf:14,R:13}]},
    {g:'300×150',  s:[{n:'H298×149×5.5×8',H:298,B:149,tw:5.5,tf:8,R:13},{n:'H300×150×6.5×9',H:300,B:150,tw:6.5,tf:9,R:13}]},
    {g:'300×200',  s:[{n:'H294×200×8×12',H:294,B:200,tw:8,tf:12,R:13}]},
    {g:'300×300',  s:[{n:'*H294×302×12×12',H:294,B:302,tw:12,tf:12,R:13},{n:'H300×300×10×15',H:300,B:300,tw:10,tf:15,R:13},{n:'*H300×305×15×15',H:300,B:305,tw:15,tf:15,R:13},{n:'*H304×301×11×17',H:304,B:301,tw:11,tf:17,R:13},{n:'*H312×303×13×21',H:312,B:303,tw:13,tf:21,R:13},{n:'*H318×307×17×24',H:318,B:307,tw:17,tf:24,R:13},{n:'*H326×310×20×28',H:326,B:310,tw:20,tf:28,R:13}]},
    {g:'350×175',  s:[{n:'H346×174×6×9',H:346,B:174,tw:6,tf:9,R:13},{n:'H350×175×7×11',H:350,B:175,tw:7,tf:11,R:13}]},
    {g:'350×250',  s:[{n:'*H336×249×8×12',H:336,B:249,tw:8,tf:12,R:13},{n:'H340×250×9×14',H:340,B:250,tw:9,tf:14,R:13},{n:'*H350×252×11×19',H:350,B:252,tw:11,tf:19,R:13},{n:'*H356×256×15×22',H:356,B:256,tw:15,tf:22,R:13},{n:'*H364×258×17×26',H:364,B:258,tw:17,tf:26,R:13}]},
    {g:'350×350',  s:[{n:'*H338×351×13×13',H:338,B:351,tw:13,tf:13,R:13},{n:'*H344×348×10×16',H:344,B:348,tw:10,tf:16,R:13},{n:'*H344×354×16×16',H:344,B:354,tw:16,tf:16,R:13},{n:'H350×350×12×19',H:350,B:350,tw:12,tf:19,R:13},{n:'*H350×357×19×19',H:350,B:357,tw:19,tf:19,R:13},{n:'*H360×354×16×24',H:360,B:354,tw:16,tf:24,R:13},{n:'*H368×356×18×28',H:368,B:356,tw:18,tf:28,R:13},{n:'*H378×358×20×33',H:378,B:358,tw:20,tf:33,R:13}]},
    {g:'400×200',  s:[{n:'H396×199×7×11',H:396,B:199,tw:7,tf:11,R:13},{n:'H400×200×8×13',H:400,B:200,tw:8,tf:13,R:13}]},
    {g:'400×300',  s:[{n:'*H386×299×9×14',H:386,B:299,tw:9,tf:14,R:13},{n:'H390×300×10×16',H:390,B:300,tw:10,tf:16,R:13},{n:'*H400×304×14×21',H:400,B:304,tw:14,tf:21,R:13},{n:'*H418×310×20×30',H:418,B:310,tw:20,tf:30,R:13}]},
    {g:'400×400',  s:[{n:'*H388×402×15×15',H:388,B:402,tw:15,tf:15,R:22},{n:'*H394×398×12×18',H:394,B:398,tw:12,tf:18,R:22},{n:'*H394×405×18×18',H:394,B:405,tw:18,tf:18,R:22},{n:'H400×400×13×21',H:400,B:400,tw:13,tf:21,R:22},{n:'H400×408×21×21',H:400,B:408,tw:21,tf:21,R:22},{n:'H414×405×18×28',H:414,B:405,tw:18,tf:28,R:22},{n:'H428×407×20×35',H:428,B:407,tw:20,tf:35,R:22}]},
    {g:'450×200',  s:[{n:'H446×199×8×12',H:446,B:199,tw:8,tf:12,R:13},{n:'H450×200×9×14',H:450,B:200,tw:9,tf:14,R:13},{n:'*H456×201×10×17',H:456,B:201,tw:10,tf:17,R:13},{n:'*H466×205×14×22',H:466,B:205,tw:14,tf:22,R:13},{n:'*H478×208×17×28',H:478,B:208,tw:17,tf:28,R:13}]},
    {g:'450×300',  s:[{n:'*H434×299×10×15',H:434,B:299,tw:10,tf:15,R:13},{n:'H440×300×11×18',H:440,B:300,tw:11,tf:18,R:13},{n:'*H446×302×13×21',H:446,B:302,tw:13,tf:21,R:13},{n:'*H450×304×15×23',H:450,B:304,tw:15,tf:23,R:13},{n:'*H458×306×17×27',H:458,B:306,tw:17,tf:27,R:13},{n:'*H468×308×19×32',H:468,B:308,tw:19,tf:32,R:13}]},
    {g:'500×200',  s:[{n:'H496×199×9×14',H:496,B:199,tw:9,tf:14,R:13},{n:'H500×200×10×16',H:500,B:200,tw:10,tf:16,R:13},{n:'H506×201×11×19',H:506,B:201,tw:11,tf:19,R:13},{n:'*H512×202×12×22',H:512,B:202,tw:12,tf:22,R:13},{n:'*H518×205×15×25',H:518,B:205,tw:15,tf:25,R:13},{n:'*H528×208×18×30',H:528,B:208,tw:18,tf:30,R:13},{n:'*H536×210×20×34',H:536,B:210,tw:20,tf:34,R:13},{n:'*H548×215×25×40',H:548,B:215,tw:25,tf:40,R:13}]},
    {g:'500×300',  s:[{n:'H482×300×11×15',H:482,B:300,tw:11,tf:15,R:13},{n:'H488×300×11×18',H:488,B:300,tw:11,tf:18,R:13},{n:'*H494×302×13×21',H:494,B:302,tw:13,tf:21,R:13},{n:'*H500×304×15×24',H:500,B:304,tw:15,tf:24,R:13},{n:'*H510×306×17×29',H:510,B:306,tw:17,tf:29,R:13},{n:'*H518×310×21×33',H:518,B:310,tw:21,tf:33,R:13},{n:'*H532×314×25×40',H:532,B:314,tw:25,tf:40,R:13}]},
    {g:'600×200',  s:[{n:'H596×199×10×15',H:596,B:199,tw:10,tf:15,R:13},{n:'H600×200×11×17',H:600,B:200,tw:11,tf:17,R:13},{n:'H606×201×12×20',H:606,B:201,tw:12,tf:20,R:13},{n:'*H612×202×13×23',H:612,B:202,tw:13,tf:23,R:13},{n:'*H618×205×14×26',H:618,B:205,tw:14,tf:26,R:13},{n:'*H626×207×18×30',H:626,B:207,tw:18,tf:30,R:13},{n:'*H634×209×20×34',H:634,B:209,tw:20,tf:34,R:13},{n:'*H646×214×25×40',H:646,B:214,tw:25,tf:40,R:13}]},
    {g:'600×300',  s:[{n:'H582×300×12×17',H:582,B:300,tw:12,tf:17,R:13},{n:'H588×300×12×20',H:588,B:300,tw:12,tf:20,R:13},{n:'H594×302×14×23',H:594,B:302,tw:14,tf:23,R:13},{n:'*H600×304×16×26',H:600,B:304,tw:16,tf:26,R:13},{n:'*H608×306×18×30',H:608,B:306,tw:18,tf:30,R:13},{n:'*H616×308×20×34',H:616,B:308,tw:20,tf:34,R:13},{n:'*H628×312×24×40',H:628,B:312,tw:24,tf:40,R:13}]},
    {g:'700×300',  s:[{n:'H692×300×13×20',H:692,B:300,tw:13,tf:20,R:18},{n:'H700×300×13×24',H:700,B:300,tw:13,tf:24,R:18},{n:'H708×302×15×28',H:708,B:302,tw:15,tf:28,R:18},{n:'*H712×306×19×30',H:712,B:306,tw:19,tf:30,R:18},{n:'*H718×308×21×33',H:718,B:308,tw:21,tf:33,R:18},{n:'*H732×311×24×40',H:732,B:311,tw:24,tf:40,R:18}]},
    {g:'800×300',  s:[{n:'H792×300×14×22',H:792,B:300,tw:14,tf:22,R:18},{n:'H800×300×14×26',H:800,B:300,tw:14,tf:26,R:18},{n:'H808×302×16×30',H:808,B:302,tw:16,tf:30,R:18}]},
  ];

  // ── 斷面性質計算 (cm) ──
  function calcProps(mm) {
    const H = mm.H/10, B = mm.B/10, tw = mm.tw/10, tf = mm.tf/10, R = (mm.R||0)/10;
    const hw = H - 2*tf;
    let A  = 2*B*tf + hw*tw;
    let Ix = 2*(B*tf**3/12 + B*tf*((H-tf)/2)**2) + tw*hw**3/12;
    let Iy = 2*tf*B**3/12 + hw*tw**3/12;
    let Zx = 2*(B*tf*(H/2-tf/2) + tw*(hw/2)*(hw/4));
    let Zy = 2*(tf*B**2/4) + hw*tw**2/4;
    // 圓角修正
    if (R > 0) {
      const Af = R**2*(1 - PI/4), yf = R/(6*(1-PI/4));
      const Ic = R**4*(16-3*PI)/48, Io = Ic - Af*yf**2;
      const dx = (H/2-tf) - yf, dy = tw/2 + yf;
      A  += 4*Af; Ix += 4*(Io + Af*dx**2); Iy += 4*(Io + Af*dy**2);
      Zx += 4*Af*dx; Zy += 4*Af*dy;
    }
    const Sx  = Ix/(H/2);
    const Sy  = Iy/(B/2);
    const rx  = Math.sqrt(Ix/A);
    const ry  = Math.sqrt(Iy/A);
    const Aw  = hw*tw;  // 腹板剪力面積
    const J   = (2*B*tf**3 + hw*tw**3)/3;
    const ho  = H - tf;              // 翼板中心間距
    const Cw  = Iy*ho**2/4;         // 翹曲常數
    // rts (AISC F2-7): rts² = √(Iy·Cw)/Sx = Iy·ho/(2·Sx)
    const rts = Math.sqrt(Iy*ho/(2*Sx));
    return { H,B,tw,tf,R,hw, A,Ix,Iy,Sx,Sy,rx,ry,Zx,Zy, Aw,J,Cw,ho,rts, name:mm.n };
  }

  // ── 斷面分類 (AISC Table B4.1b) ──
  function classify(sec, Fy) {
    const E = ES;
    // 翼板寬厚比
    const lambdaF = sec.B / (2*sec.tf);
    const lpf = 0.38*Math.sqrt(E/Fy);   // compact limit
    const lrf = 1.0 *Math.sqrt(E/Fy);   // non-compact limit
    let flange = 'compact';
    if (lambdaF > lrf)      flange = 'slender';
    else if (lambdaF > lpf) flange = 'non-compact';

    // 腹板寬厚比
    const lambdaW = sec.hw / sec.tw;
    const lpw = 3.76*Math.sqrt(E/Fy);
    const lrw = 5.70*Math.sqrt(E/Fy);
    let web = 'compact';
    if (lambdaW > lrw)      web = 'slender';
    else if (lambdaW > lpw) web = 'non-compact';

    return { lambdaF, lpf, lrf, flange, lambdaW, lpw, lrw, web };
  }

  // ── 撓曲強度 Mn (AISC Ch.F, doubly-symmetric I-shape) ──
  // F2: compact flange/web | F3: noncompact/slender flange + compact web
  // F4: non-compact web    | F5: slender web
  function calcMn(sec, Fy, Lb, Cb) {
    if (Cb == null || Cb <= 0) Cb = 1.0;
    const E  = ES;
    const Mp = Fy * sec.Zx;           // kgf·cm
    const Sxc = sec.Sx;               // doubly-symmetric: Sxc = Sxt = Sx
    const Myc = Fy * Sxc;
    const cls = classify(sec, Fy);

    // 共用參數
    const aw  = sec.hw * sec.tw / (sec.B * sec.tf);    // web-to-flange area ratio
    const rt  = sec.B / Math.sqrt(12 * (1 + aw / 6));  // effective radius for LTB (F4-11)
    const kc  = Math.max(0.35, Math.min(0.76, 4 / Math.sqrt(sec.hw / sec.tw)));

    let Mn, Mn_yield, Mn_ltb, Mn_flb, Lp, Lr, Mr, ltbZone;
    let Rpc = null, Rpg = null;       // 回傳給報表
    let webSection;                    // AISC section tag
    let sectionType;                   // user-facing classification summary

    if (cls.web === 'compact') {
      // ═══ F2 / F3: Compact web ═══
      webSection = cls.flange === 'compact' ? 'F2' : 'F3';
      sectionType = cls.flange === 'compact' ? 'plastic' : 'semi-plastic';
      Mr = 0.7 * Fy * Sxc;
      Mn_yield = Mp;

      // LTB (F2-2 ~ F2-4)
      Lp = 1.76 * sec.ry * Math.sqrt(E / Fy);
      const arg = sec.J / (Sxc * sec.ho);
      Lr = 1.95 * sec.rts * (E / (0.7 * Fy)) *
        Math.sqrt(arg + Math.sqrt(arg ** 2 + 6.76 * (0.7 * Fy / E) ** 2));

      if (Lb <= Lp) {
        Mn_ltb = Mp; ltbZone = 'plastic';
      } else if (Lb <= Lr) {
        Mn_ltb = Math.min(Cb * (Mp - (Mp - Mr) * (Lb - Lp) / (Lr - Lp)), Mp);
        ltbZone = 'inelastic';
      } else {
        const Fcr = Cb * PI ** 2 * E / (Lb / sec.rts) ** 2 *
          Math.sqrt(1 + 0.078 * arg * (Lb / sec.rts) ** 2);
        Mn_ltb = Math.min(Fcr * Sxc, Mp);
        ltbZone = 'elastic';
      }

      // FLB (F3-1, F3-2)
      Mn_flb = Mp;
      if (cls.flange === 'non-compact') {
        Mn_flb = Mp - (Mp - Mr) * (cls.lambdaF - cls.lpf) / (cls.lrf - cls.lpf);
      } else if (cls.flange === 'slender') {
        Mn_flb = 0.9 * E * kc * Sxc / cls.lambdaF ** 2;
      }
      Mn = Math.min(Mn_yield, Mn_ltb, Mn_flb);

    } else if (cls.web === 'non-compact') {
      // ═══ F4: Non-compact web ═══
      webSection = 'F4';
      sectionType = 'semi-plastic';
      const Rpc_max = Mp / Myc;  // = Zx/Sx
      Rpc = Math.min(Rpc_max,
        Rpc_max - (Rpc_max - 1) * (cls.lambdaW - cls.lpw) / (cls.lrw - cls.lpw));
      const FL = 0.7 * Fy;  // doubly-symmetric: Sxt/Sxc = 1 ≥ 0.7 → F4-6a
      Mr = FL * Sxc;

      // Yielding (F4-1)
      Mn_yield = Rpc * Myc;

      // LTB (F4-2 ~ F4-5)
      Lp = 1.1 * rt * Math.sqrt(E / Fy);
      const argF4 = sec.J / (Sxc * sec.ho);
      Lr = 1.95 * rt * (E / FL) *
        Math.sqrt(argF4 + Math.sqrt(argF4 ** 2 + 6.76 * (FL / E) ** 2));

      if (Lb <= Lp) {
        Mn_ltb = Rpc * Myc; ltbZone = 'plastic';
      } else if (Lb <= Lr) {
        Mn_ltb = Math.min(
          Cb * (Rpc * Myc - (Rpc * Myc - FL * Sxc) * (Lb - Lp) / (Lr - Lp)),
          Rpc * Myc);
        ltbZone = 'inelastic';
      } else {
        const Fcr = Cb * PI ** 2 * E / (Lb / rt) ** 2 *
          Math.sqrt(1 + 0.078 * argF4 * (Lb / rt) ** 2);
        Mn_ltb = Math.min(Fcr * Sxc, Rpc * Myc);
        ltbZone = 'elastic';
      }

      // FLB (F4-12 ~ F4-14)
      Mn_flb = Rpc * Myc;
      if (cls.flange === 'non-compact') {
        Mn_flb = Rpc * Myc - (Rpc * Myc - FL * Sxc) * (cls.lambdaF - cls.lpf) / (cls.lrf - cls.lpf);
      } else if (cls.flange === 'slender') {
        Mn_flb = 0.9 * E * kc * Sxc / cls.lambdaF ** 2;
      }
      Mn = Math.min(Mn_yield, Mn_ltb, Mn_flb);

    } else {
      // ═══ F5: Slender web ═══
      webSection = 'F5';
      sectionType = 'slender';
      const aw5 = Math.min(10, aw);
      Rpg = Math.min(1.0,
        1 - aw5 / (1200 + 300 * aw5) * (sec.hw / sec.tw - 5.7 * Math.sqrt(E / Fy)));
      Mr = 0.7 * Fy * Sxc;

      // Compression flange yielding (F5-1)
      Mn_yield = Rpg * Fy * Sxc;

      // LTB (F5-2 ~ F5-4)
      Lp = 1.1 * rt * Math.sqrt(E / Fy);
      Lr = PI * rt * Math.sqrt(E / (0.7 * Fy));

      if (Lb <= Lp) {
        Mn_ltb = Rpg * Fy * Sxc; ltbZone = 'plastic';
      } else if (Lb <= Lr) {
        Mn_ltb = Math.min(
          Rpg * Cb * (Fy - 0.3 * Fy * (Lb - Lp) / (Lr - Lp)) * Sxc,
          Rpg * Fy * Sxc);
        ltbZone = 'inelastic';
      } else {
        const Fcr = Cb * PI ** 2 * E / (Lb / rt) ** 2;
        Mn_ltb = Math.min(Rpg * Fcr * Sxc, Rpg * Fy * Sxc);
        ltbZone = 'elastic';
      }

      // FLB (F5-7 ~ F5-9)
      Mn_flb = Rpg * Fy * Sxc;
      if (cls.flange === 'non-compact') {
        Mn_flb = Rpg * (Fy - 0.3 * Fy * (cls.lambdaF - cls.lpf) / (cls.lrf - cls.lpf)) * Sxc;
      } else if (cls.flange === 'slender') {
        Mn_flb = Rpg * 0.9 * E * kc * Sxc / cls.lambdaF ** 2;
      }
      Mn = Math.min(Mn_yield, Mn_ltb, Mn_flb);
    }

    // 判定控制機制
    const controls = ['Yielding'];
    if (Lb > Lp) controls.push('LTB');
    if (cls.flange !== 'compact') controls.push('FLB');
    let governing = 'Yielding';
    if (Mn === Mn_ltb && Mn < Mn_yield) governing = 'LTB';
    if (Mn === Mn_flb && Mn < Mn_yield && Mn <= Mn_ltb) governing = 'FLB';

    return {
      Mp, Mr, Mn, Mn_yield, Mn_ltb, Mn_flb,
      Lp, Lr, Cb, Lb, ltbZone,
      cls, controls, governing, webSection,
      sectionType,
      Rpc, Rpg, rt,
      // LRFD
      phiMn: PHI.flexure * Mn,            // kgf·cm
      phiMn_tfm: PHI.flexure * Mn / 1e5,  // tf·m
      // ASD
      MnOmega:     Mn / OMEGA.flexure,           // kgf·cm
      MnOmega_tfm: Mn / OMEGA.flexure / 1e5,     // tf·m
    };
  }

  // ── 剪力強度 Vn (AISC G2) ──
  function calcVn(sec, Fy) {
    const E = ES;
    const kv = 5.34;  // unstiffened web
    const ratio = sec.hw / sec.tw;
    // AISC G2.1(a): h/tw ≤ 2.24√(E/Fy) → φ=1.00, Ω=1.50
    const isCompactWeb = ratio <= 2.24*Math.sqrt(E/Fy);
    let Cv1;
    if (isCompactWeb) {
      Cv1 = 1.0;
    } else if (ratio <= 1.10*Math.sqrt(kv*E/Fy)) {
      Cv1 = 1.0;
    } else if (ratio <= 1.37*Math.sqrt(kv*E/Fy)) {
      Cv1 = 1.10*Math.sqrt(kv*E/Fy) / ratio;
    } else {
      Cv1 = 1.51*kv*E / (ratio**2 * Fy);
    }
    const Vn = 0.6 * Fy * sec.Aw * Cv1;
    const phiV = isCompactWeb ? PHI.shearCompact : PHI.shear;
    const omgV = isCompactWeb ? OMEGA.shearCompact : OMEGA.shear;
    return {
      Vn, Cv1, kv, isCompactWeb,
      // LRFD
      phiV,
      phiVn:     phiV * Vn,           // kgf
      phiVn_tf:  phiV * Vn / 1000,    // tf
      // ASD
      omgV,
      VnOmega:    Vn / omgV,          // kgf
      VnOmega_tf: Vn / omgV / 1000,   // tf
    };
  }

  // ── 撓度 (簡支均佈) ──
  function calcDeflection(sec, wD_kgcm, wL_kgcm, L_cm) {
    const EI = ES * sec.Ix;
    const deltaD = 5*wD_kgcm*L_cm**4 / (384*EI);
    const deltaL = 5*wL_kgcm*L_cm**4 / (384*EI);
    const deltaT = deltaD + deltaL;
    return { deltaD, deltaL, deltaT, EI, ratioL: L_cm/deltaL, ratioT: L_cm/deltaT };
  }

  // ── Cb 計算 (AISC F1-1, quarter-point method) ──
  // Ma, Mb, Mc = 1/4, 1/2, 3/4 點彎矩的絕對值; Mmax = 跨內最大彎矩絕對值
  function calcCb(Mmax, Ma, Mb, Mc) {
    return 12.5*Mmax / (2.5*Mmax + 3*Ma + 4*Mb + 3*Mc);
  }

  // ══════════════════════════════════════════════
  //  壓力構件 (Column) — Phase 2~6
  // ══════════════════════════════════════════════

  // ── 壓力構件斷面分類 (AISC Table B4.1a) ──
  function classifyCompression(sec, Fy) {
    const E = ES;
    // 翼板 (非加勁): λr = 0.56√(E/Fy)
    const lambdaF = sec.B / (2 * sec.tf);
    const lrf_comp = 0.56 * Math.sqrt(E / Fy);
    const flangeSlender = lambdaF > lrf_comp;
    // 腹板 (加勁, 均佈壓力): λr = 1.49√(E/Fy)
    const lambdaW = sec.hw / sec.tw;
    const lrw_comp = 1.49 * Math.sqrt(E / Fy);
    const webSlender = lambdaW > lrw_comp;
    return { lambdaF, lrf_comp, flangeSlender, lambdaW, lrw_comp, webSlender,
             isSlender: flangeSlender || webSlender };
  }

  // ── 細長構件折減係數 Q (AISC E7) ──
  function _calcQ(sec, Fy) {
    const E = ES;
    const cls = classifyCompression(sec, Fy);
    let Qs = 1.0, Qa = 1.0;
    // Qs — 非加勁翼板 (E7.1)
    if (cls.flangeSlender) {
      const bt = cls.lambdaF;
      const lim1 = 1.03 * Math.sqrt(E / Fy);
      if (bt <= lim1) {
        Qs = 1.415 - 0.65 * bt * Math.sqrt(Fy / E);
      } else {
        Qs = 0.69 * E / (Fy * bt * bt);
      }
    }
    // Qa — 加勁腹板 (E7.2, 保守取 f=Fy)
    if (cls.webSlender) {
      const bt = cls.lambdaW;
      const be = 1.92 * sec.tw * Math.sqrt(E / Fy) *
                 (1 - 0.34 / bt * Math.sqrt(E / Fy));
      const be_eff = Math.min(Math.max(be, 0), sec.hw);
      const Ae = sec.A - (sec.hw - be_eff) * sec.tw;
      Qa = Ae / sec.A;
    }
    return { Q: Qs * Qa, Qs, Qa, cls };
  }

  // ── 有效長度因數 K (Dumonteil 1992 近似) ──
  //    GA, GB: 節點剛度比 Σ(EI/L)柱 / Σ(EI/L)梁
  //    鉸接端取 G=10, 固接端取 G=1
  function calcK(GA, GB, braced) {
    if (braced) {
      // 有側撐 (Dumonteil 1992)
      return (3*GA*GB + 1.4*(GA+GB) + 0.64) /
             (3*GA*GB + 2.0*(GA+GB) + 1.28);
    }
    // 無側撐
    return Math.sqrt((1.6*GA*GB + 4*(GA+GB) + 7.5) / (GA + GB + 7.5));
  }

  // ── 軸壓強度 (AISC E3 + E7 + ASD 傳統) ──
  function calcPn(sec, Fy, KLr_x, KLr_y) {
    const E = ES;
    const KLr = Math.max(KLr_x, KLr_y);
    const axis = KLr_x >= KLr_y ? 'x' : 'y';
    const Fe = PI * PI * E / (KLr * KLr);
    const Cc = Math.sqrt(2 * PI * PI * E / Fy);

    // Q (slender element reduction)
    const qr = _calcQ(sec, Fy);
    const Q = qr.Q, QFy = Q * Fy;

    // AISC E7 (reduces to E3 when Q=1)
    const limit = 4.71 * Math.sqrt(E / QFy);
    let Fcr, zone;
    if (KLr <= limit) {
      Fcr = Q * Math.pow(0.658, QFy / Fe) * Fy;
      zone = 'inelastic';
    } else {
      Fcr = 0.877 * Fe;
      zone = 'elastic';
    }
    const Pn = Fcr * sec.A;

    // ASD 傳統 Fa (AISC 9th Ed / 台灣鋼構容許應力法)
    let Fa;
    if (KLr < Cc) {
      const r = KLr / Cc;
      const FS = 5/3 + 3*r/8 - r*r*r/8;
      Fa = (1 - r*r/2) * Fy / FS;
    } else {
      Fa = 12 * PI * PI * E / (23 * KLr * KLr);
    }
    const Pa_asd = Fa * sec.A;

    return {
      KLr, KLr_x, KLr_y, axis, Fe, Fcr, Pn, zone, limit, Cc, Q, qr,
      Fa, Pa_asd,
      // LRFD
      phiPn:      PHI.compress * Pn,
      phiPn_tf:   PHI.compress * Pn / 1000,
      // ASD (AISC 360 unified)
      PnOmega:    Pn / OMEGA.compress,
      PnOmega_tf: Pn / OMEGA.compress / 1000,
      // ASD (traditional)
      Pa_asd_tf:  Pa_asd / 1000,
    };
  }

  // ── 弱軸撓曲強度 Mny (AISC F6) ──
  function calcMny(sec, Fy) {
    const E = ES;
    const Mpy = Math.min(Fy * sec.Zy, 1.6 * Fy * sec.Sy);
    const cls = classify(sec, Fy);
    let Mn;
    if (cls.flange === 'compact') {
      Mn = Mpy;
    } else if (cls.flange === 'non-compact') {
      Mn = Mpy - (Mpy - 0.7*Fy*sec.Sy) * (cls.lambdaF - cls.lpf) / (cls.lrf - cls.lpf);
    } else {
      const Fcr = 0.69 * E / (cls.lambdaF ** 2);
      Mn = Fcr * sec.Sy;
    }
    return {
      Mpy, Mn,
      phiMny:       PHI.flexure * Mn,
      phiMny_tfm:   PHI.flexure * Mn / 1e5,
      MnyOmega:     Mn / OMEGA.flexure,
      MnyOmega_tfm: Mn / OMEGA.flexure / 1e5,
    };
  }

  // ── 互制方程 — LRFD (AISC H1-1) ──
  //    Pr, Mrx, Mry: 需求 (含放大);  Pc, Mcx, Mcy: 設計強度
  function calcInteraction(Pr, Pc, Mrx, Mcx, Mry, Mcy) {
    if (Pc <= 0) return { IR: 999, eqUsed: '-', ratio_P: 999, ok: false };
    const ratio_P = Pr / Pc;
    let IR, eqUsed;
    if (ratio_P >= 0.2) {
      // H1-1a
      IR = ratio_P + 8/9 * ((Mcx > 0 ? Mrx/Mcx : 0) + (Mcy > 0 ? Mry/Mcy : 0));
      eqUsed = 'H1-1a';
    } else {
      // H1-1b
      IR = ratio_P / 2 + ((Mcx > 0 ? Mrx/Mcx : 0) + (Mcy > 0 ? Mry/Mcy : 0));
      eqUsed = 'H1-1b';
    }
    return { IR, eqUsed, ratio_P, ok: IR <= 1.0 };
  }

  // ── 互制方程 — ASD 傳統 (fa/Fa ≤ 0.15 門檻) ──
  //    fa, fbx, fby: 使用應力 (kgf/cm²)
  //    Fa, Fbx, Fby: 容許應力  (kgf/cm²)
  //    Fex, Fey: 尤拉應力 12π²E/(23(KL/r)²)
  //    Cmx, Cmy: 放大係數
  function calcInteractionASD(fa, Fa, fbx, Fbx, fby, Fby, Cmx, Cmy, Fex, Fey, Fy) {
    const ratio = Fa > 0 ? fa / Fa : 999;
    let IR1 = 0, IR2 = 0, eqUsed;

    const mxTerm = Fbx > 0 ? fbx / Fbx : 0;
    const myTerm = Fby > 0 ? fby / Fby : 0;

    if (ratio <= 0.15) {
      IR1 = ratio + mxTerm + myTerm;
      eqUsed = 'simplified';
      return { IR1, IR2: 0, eqUsed, ratio, ok: IR1 <= 1.0 };
    }

    // 穩定方程 (含二次彎矩放大)
    const ampX = Fex > fa ? (1 - fa / Fex) : 0.001;
    const ampY = Fey > fa ? (1 - fa / Fey) : 0.001;
    IR1 = ratio
        + (Fbx > 0 ? Cmx * fbx / (ampX * Fbx) : 0)
        + (Fby > 0 ? Cmy * fby / (ampY * Fby) : 0);

    // 強度方程
    IR2 = fa / (0.60 * Fy) + mxTerm + myTerm;

    eqUsed = 'full';
    return { IR1, IR2, eqUsed, ratio, ok: IR1 <= 1.0 && IR2 <= 1.0 };
  }

  // ── B1 放大因子 (AISC C2, no-sway) ──
  function calcB1(Cm, Pu_kgf, Pe1_kgf) {
    if (Pe1_kgf <= 0) return 1.0;
    return Math.max(1.0, Cm / (1 - Pu_kgf / Pe1_kgf));
  }

  // ── 匯出 ──
  global.Steel = {
    ES, G, FY_OPTIONS, PHI, OMEGA,
    H_SECTIONS_MM,
    calcProps,
    classify,
    classifyCompression,
    calcMn,
    calcMny,
    calcVn,
    calcDeflection,
    calcCb,
    calcK,
    calcPn,
    calcInteraction,
    calcInteractionASD,
    calcB1,
  };
})(window);
