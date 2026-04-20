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

  // ── 常用 SHS / CHS 規格 (mm) ──
  // SHS 參考：NIPPON STEEL METAL PRODUCTS HSS Catalogue（JIS G3466 / BCR295 常用尺寸）
  // CHS 參考：NS Eco Pile standard steel pipe chart（JIS G3444/STK490 常用尺寸）
  const SHS_SECTIONS_MM = [
    { g:'150×150', s:[
      { n:'SHS 150×150×6.0', B:150, t:6.0 },
      { n:'SHS 150×150×9.0', B:150, t:9.0 },
      { n:'SHS 150×150×12.0', B:150, t:12.0 },
    ]},
    { g:'175×175', s:[
      { n:'SHS 175×175×6.0', B:175, t:6.0 },
      { n:'SHS 175×175×9.0', B:175, t:9.0 },
    ]},
    { g:'200×200', s:[
      { n:'SHS 200×200×6.0', B:200, t:6.0 },
      { n:'SHS 200×200×8.0', B:200, t:8.0 },
      { n:'SHS 200×200×9.0', B:200, t:9.0 },
      { n:'SHS 200×200×12.0', B:200, t:12.0 },
    ]},
    { g:'250×250', s:[
      { n:'SHS 250×250×6.0', B:250, t:6.0 },
      { n:'SHS 250×250×9.0', B:250, t:9.0 },
      { n:'SHS 250×250×12.0', B:250, t:12.0 },
      { n:'SHS 250×250×16.0', B:250, t:16.0 },
    ]},
    { g:'300×300', s:[
      { n:'SHS 300×300×6.0', B:300, t:6.0 },
      { n:'SHS 300×300×9.0', B:300, t:9.0 },
      { n:'SHS 300×300×12.0', B:300, t:12.0 },
      { n:'SHS 300×300×16.0', B:300, t:16.0 },
    ]},
    { g:'350×350', s:[
      { n:'SHS 350×350×9.0', B:350, t:9.0 },
      { n:'SHS 350×350×12.0', B:350, t:12.0 },
      { n:'SHS 350×350×16.0', B:350, t:16.0 },
    ]},
    { g:'400×400', s:[
      { n:'SHS 400×400×9.0', B:400, t:9.0 },
      { n:'SHS 400×400×12.0', B:400, t:12.0 },
      { n:'SHS 400×400×16.0', B:400, t:16.0 },
    ]},
  ];

  const RHS_SECTIONS_MM = [
    { g:'175×125', s:[
      { n:'RHS 175×125×6.0', H:175, B:125, t:6.0 },
      { n:'RHS 175×125×9.0', H:175, B:125, t:9.0 },
      { n:'RHS 175×125×12.0', H:175, B:125, t:12.0 },
    ]},
    { g:'200×100', s:[
      { n:'RHS 200×100×6.0', H:200, B:100, t:6.0 },
      { n:'RHS 200×100×9.0', H:200, B:100, t:9.0 },
      { n:'RHS 200×100×12.0', H:200, B:100, t:12.0 },
    ]},
    { g:'200×150', s:[
      { n:'RHS 200×150×6.0', H:200, B:150, t:6.0 },
      { n:'RHS 200×150×9.0', H:200, B:150, t:9.0 },
      { n:'RHS 200×150×12.0', H:200, B:150, t:12.0 },
    ]},
    { g:'250×100', s:[
      { n:'RHS 250×100×6.0', H:250, B:100, t:6.0 },
      { n:'RHS 250×100×9.0', H:250, B:100, t:9.0 },
      { n:'RHS 250×100×12.0', H:250, B:100, t:12.0 },
    ]},
    { g:'250×150', s:[
      { n:'RHS 250×150×6.0', H:250, B:150, t:6.0 },
      { n:'RHS 250×150×8.0', H:250, B:150, t:8.0 },
      { n:'RHS 250×150×9.0', H:250, B:150, t:9.0 },
      { n:'RHS 250×150×12.0', H:250, B:150, t:12.0 },
    ]},
    { g:'300×200', s:[
      { n:'RHS 300×200×6.0', H:300, B:200, t:6.0 },
      { n:'RHS 300×200×8.0', H:300, B:200, t:8.0 },
      { n:'RHS 300×200×9.0', H:300, B:200, t:9.0 },
      { n:'RHS 300×200×12.0', H:300, B:200, t:12.0 },
      { n:'RHS 300×200×14.0', H:300, B:200, t:14.0 },
      { n:'RHS 300×200×16.0', H:300, B:200, t:16.0 },
    ]},
    { g:'350×150', s:[
      { n:'RHS 350×150×6.0', H:350, B:150, t:6.0 },
      { n:'RHS 350×150×8.0', H:350, B:150, t:8.0 },
      { n:'RHS 350×150×9.0', H:350, B:150, t:9.0 },
      { n:'RHS 350×150×12.0', H:350, B:150, t:12.0 },
    ]},
    { g:'400×200', s:[
      { n:'RHS 400×200×6.0', H:400, B:200, t:6.0 },
      { n:'RHS 400×200×8.0', H:400, B:200, t:8.0 },
      { n:'RHS 400×200×9.0', H:400, B:200, t:9.0 },
      { n:'RHS 400×200×12.0', H:400, B:200, t:12.0 },
    ]},
    { g:'600×300', s:[
      { n:'RHS 600×300×12.0', H:600, B:300, t:12.0 },
      { n:'RHS 600×300×14.0', H:600, B:300, t:14.0 },
      { n:'RHS 600×300×16.0', H:600, B:300, t:16.0 },
      { n:'RHS 600×300×19.0', H:600, B:300, t:19.0 },
    ]},
  ];

  const CHS_SECTIONS_MM = [
    { g:'114.3', s:[{ n:'CHS 114.3×4.5', D:114.3, t:4.5 }]},
    { g:'139.8', s:[{ n:'CHS 139.8×4.5', D:139.8, t:4.5 }]},
    { g:'165.2', s:[
      { n:'CHS 165.2×4.5', D:165.2, t:4.5 },
      { n:'CHS 165.2×6.0', D:165.2, t:6.0 },
    ]},
    { g:'190.7', s:[
      { n:'CHS 190.7×5.3', D:190.7, t:5.3 },
      { n:'CHS 190.7×7.0', D:190.7, t:7.0 },
    ]},
    { g:'216.3', s:[
      { n:'CHS 216.3×5.8', D:216.3, t:5.8 },
      { n:'CHS 216.3×8.2', D:216.3, t:8.2 },
    ]},
    { g:'267.4', s:[
      { n:'CHS 267.4×5.8', D:267.4, t:5.8 },
      { n:'CHS 267.4×9.3', D:267.4, t:9.3 },
    ]},
    { g:'318.5', s:[
      { n:'CHS 318.5×6.9', D:318.5, t:6.9 },
      { n:'CHS 318.5×10.3', D:318.5, t:10.3 },
    ]},
    { g:'355.6', s:[
      { n:'CHS 355.6×7.9', D:355.6, t:7.9 },
      { n:'CHS 355.6×11.1', D:355.6, t:11.1 },
    ]},
    { g:'406.4', s:[
      { n:'CHS 406.4×9.5', D:406.4, t:9.5 },
      { n:'CHS 406.4×12.7', D:406.4, t:12.7 },
    ]},
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
    if (Pe1_kgf <= 0) return Infinity;
    const stabilityRatio = Pu_kgf / Pe1_kgf;
    if (stabilityRatio >= 1.0) return Infinity;
    return Math.max(1.0, Cm / (1 - stabilityRatio));
  }

  function _calcClosedHssJ(H, B, t) {
    const hc = H - t;
    const bc = B - t;
    if (hc <= 0 || bc <= 0 || t <= 0) return 0;
    const areaCell = hc * bc;
    const sumDsOverT = 2 * bc / t + 2 * hc / t;
    if (sumDsOverT <= 0) return 0;
    return 4 * areaCell * areaCell / sumDsOverT;
  }

  function calcSquareHssProps(mm) {
    const B = mm.B / 10;
    const tNom = mm.t / 10;
    const t = 0.93 * tNom;
    const Bi = B - 2 * t;
    if (B <= 0 || t <= 0 || Bi <= 0) return null;
    const A = B * B - Bi * Bi;
    const Ix = (B ** 4 - Bi ** 4) / 12;
    const Iy = Ix;
    const S = Ix / (B / 2);
    const Z = (B ** 3 - Bi ** 3) / 4;
    const r = Math.sqrt(Ix / A);
    const J = _calcClosedHssJ(B, B, t);
    const flat = B - 3 * t;
    const Aw = 2 * flat * t;
    return {
      shape: "shs",
      B,
      H: B,
      tNom,
      t,
      flat,
      bFlat: flat,
      hFlat: flat,
      A,
      Ix,
      Iy,
      Sx: S,
      Sy: S,
      rx: r,
      ry: r,
      Zx: Z,
      Zy: Z,
      Aw,
      J,
      name: mm.n || `SHS ${mm.B}×${mm.B}×${mm.t}`,
    };
  }

  function calcRectHssProps(mm) {
    const H = mm.H / 10;
    const B = mm.B / 10;
    const tNom = mm.t / 10;
    const t = 0.93 * tNom;
    const Hi = H - 2 * t;
    const Bi = B - 2 * t;
    if (H <= 0 || B <= 0 || t <= 0 || Hi <= 0 || Bi <= 0) return null;
    const A = B * H - Bi * Hi;
    const Ix = (B * H ** 3 - Bi * Hi ** 3) / 12;
    const Iy = (H * B ** 3 - Hi * Bi ** 3) / 12;
    const Sx = Ix / (H / 2);
    const Sy = Iy / (B / 2);
    const Zx = (B * H ** 2 - Bi * Hi ** 2) / 4;
    const Zy = (H * B ** 2 - Hi * Bi ** 2) / 4;
    const rx = Math.sqrt(Ix / A);
    const ry = Math.sqrt(Iy / A);
    const J = _calcClosedHssJ(H, B, t);
    const bFlat = Math.max(0, B - 3 * t);
    const hFlat = Math.max(0, H - 3 * t);
    const Awx = 2 * hFlat * t;
    const Awy = 2 * bFlat * t;
    return {
      shape: "rhs",
      H,
      B,
      tNom,
      t,
      A,
      Ag: A,
      Ix,
      Iy,
      Sx,
      Sy,
      rx,
      ry,
      Zx,
      Zy,
      J,
      bFlat,
      hFlat,
      Aw: Awx,
      Awx,
      Awy,
      name: mm.n || `RHS ${mm.H}×${mm.B}×${mm.t}`,
    };
  }

  function calcRoundHssProps(mm) {
    const D = mm.D / 10;
    const tNom = mm.t / 10;
    const t = 0.93 * tNom;
    const d = D - 2 * t;
    if (D <= 0 || t <= 0 || d <= 0) return null;
    const A = PI / 4 * (D ** 2 - d ** 2);
    const I = PI / 64 * (D ** 4 - d ** 4);
    const S = I / (D / 2);
    const Z = (D ** 3 - d ** 3) / 6;
    const r = Math.sqrt(I / A);
    const J = PI / 32 * (D ** 4 - d ** 4);
    return {
      shape: "chs",
      D,
      tNom,
      t,
      A,
      Ix: I,
      Iy: I,
      Sx: S,
      Sy: S,
      rx: r,
      ry: r,
      Zx: Z,
      Zy: Z,
      Ag: A,
      J,
      name: mm.n || `CHS ${mm.D}×${mm.t}`,
    };
  }

  function classifyRectHssFlexure(sec, Fy, axis = 'x') {
    const E = ES;
    const flangeFlat = axis === 'y' ? sec.hFlat : sec.bFlat;
    const webFlat = axis === 'y' ? sec.bFlat : sec.hFlat;
    const lambdaF = flangeFlat / sec.t;
    const lambdaW = webFlat / sec.t;
    const lpf = 1.12 * Math.sqrt(E / Fy);
    const lrf = 1.40 * Math.sqrt(E / Fy);
    const lpw = 2.42 * Math.sqrt(E / Fy);
    const lrw = 5.70 * Math.sqrt(E / Fy);
    let flange = 'compact';
    if (lambdaF > lrf) flange = 'slender';
    else if (lambdaF > lpf) flange = 'non-compact';
    let web = 'compact';
    if (lambdaW > lrw) web = 'slender';
    else if (lambdaW > lpw) web = 'non-compact';
    return {
      axis,
      lambdaF,
      lpf,
      lrf,
      flange,
      lambdaW,
      lpw,
      lrw,
      web,
      isSlender: flange === 'slender' || web === 'slender',
    };
  }

  function classifySquareHssFlexure(sec, Fy) {
    const E = ES;
    const lambda = sec.flat / sec.t;
    const lpf = 1.12 * Math.sqrt(E / Fy);
    const lrf = 1.40 * Math.sqrt(E / Fy);
    const lpw = 2.42 * Math.sqrt(E / Fy);
    const lrw = 5.70 * Math.sqrt(E / Fy);
    let flange = 'compact';
    if (lambda > lrf) flange = 'slender';
    else if (lambda > lpf) flange = 'non-compact';
    let web = 'compact';
    if (lambda > lrw) web = 'slender';
    else if (lambda > lpw) web = 'non-compact';
    return {
      lambdaF: lambda,
      lpf,
      lrf,
      flange,
      lambdaW: lambda,
      lpw,
      lrw,
      web,
      isSlender: flange === 'slender' || web === 'slender',
    };
  }

  function classifyRoundHssFlexure(sec, Fy) {
    const E = ES;
    const lambda = sec.D / sec.t;
    const lpf = 0.07 * E / Fy;
    const lrf = 0.31 * E / Fy;
    const limit = 0.45 * E / Fy;
    let flange = 'compact';
    if (lambda > lrf) flange = 'slender';
    else if (lambda > lpf) flange = 'non-compact';
    return {
      lambdaF: lambda,
      lpf,
      lrf,
      limit,
      flange,
      lambdaW: lambda,
      lpw: lpf,
      lrw: lrf,
      web: flange,
      isSlender: flange === 'slender',
      outOfScope: lambda >= limit,
    };
  }

  function _calcRectHssEffectiveSe(sec, beFlat, axis = 'x') {
    const H = axis === 'y' ? sec.B : sec.H;
    const B = axis === 'y' ? sec.H : sec.B;
    const t = sec.t;
    const hWeb = H - 2 * t;
    if (H <= 0 || B <= 0 || t <= 0 || hWeb <= 0) return 0;
    const topWidth = Math.max(0, Math.min(B, beFlat + 3 * t));
    const parts = [
      { b: topWidth, h: t, yc: H - t / 2 },
      { b: B, h: t, yc: t / 2 },
      { b: t, h: hWeb, yc: H / 2 },
      { b: t, h: hWeb, yc: H / 2 },
    ];
    const area = parts.reduce((sum, part) => sum + part.b * part.h, 0);
    if (area <= 0) return 0;
    const yBar = parts.reduce((sum, part) => sum + part.b * part.h * part.yc, 0) / area;
    const ix = parts.reduce((sum, part) => {
      const a = part.b * part.h;
      return sum + part.b * part.h ** 3 / 12 + a * (part.yc - yBar) ** 2;
    }, 0);
    const cTop = H - yBar;
    if (cTop <= 0) return 0;
    return ix / cTop;
  }

  function _calcSquareHssEffectiveSe(sec, beFlat) {
    const B = sec.B;
    const t = sec.t;
    const hWeb = B - 2 * t;
    if (B <= 0 || t <= 0 || hWeb <= 0) return 0;
    const topWidth = Math.max(0, Math.min(B, beFlat + 3 * t));
    const parts = [
      { b: topWidth, h: t, yc: B - t / 2 },
      { b: B, h: t, yc: t / 2 },
      { b: t, h: hWeb, yc: B / 2 },
      { b: t, h: hWeb, yc: B / 2 },
    ];
    const area = parts.reduce((sum, part) => sum + part.b * part.h, 0);
    if (area <= 0) return 0;
    const yBar = parts.reduce((sum, part) => sum + part.b * part.h * part.yc, 0) / area;
    const ix = parts.reduce((sum, part) => {
      const a = part.b * part.h;
      return sum + part.b * part.h ** 3 / 12 + a * (part.yc - yBar) ** 2;
    }, 0);
    const cTop = B - yBar;
    if (cTop <= 0) return 0;
    return ix / cTop;
  }

  function classifyRectHssCompression(sec, Fy) {
    const E = ES;
    const limit = 1.40 * Math.sqrt(E / Fy);
    const lambdaF = sec.bFlat / sec.t;
    const lambdaW = sec.hFlat / sec.t;
    const flangeSlender = lambdaF > limit;
    const webSlender = lambdaW > limit;
    return {
      lambdaF,
      lrf_comp: limit,
      flangeSlender,
      lambdaW,
      lrw_comp: limit,
      webSlender,
      isSlender: flangeSlender || webSlender,
    };
  }

  function classifySquareHssCompression(sec, Fy) {
    const E = ES;
    const limit = 1.40 * Math.sqrt(E / Fy);
    const lambda = sec.flat / sec.t;
    const isSlender = lambda > limit;
    return {
      lambdaF: lambda,
      lrf_comp: limit,
      flangeSlender: isSlender,
      lambdaW: lambda,
      lrw_comp: limit,
      webSlender: isSlender,
      isSlender,
    };
  }

  function classifyRoundHssCompression(sec, Fy) {
    const E = ES;
    const limit = 0.11 * E / Fy;
    const lambda = sec.D / sec.t;
    const isSlender = lambda > limit;
    return {
      lambdaF: lambda,
      lrf_comp: limit,
      flangeSlender: isSlender,
      lambdaW: lambda,
      lrw_comp: limit,
      webSlender: isSlender,
      isSlender,
    };
  }

  function calcPnNonslender(sec, Fy, KLr_x, KLr_y) {
    const E = ES;
    const KLr = Math.max(KLr_x, KLr_y);
    const axis = KLr_x >= KLr_y ? 'x' : 'y';
    const Fe = PI * PI * E / (KLr * KLr);
    const Cc = Math.sqrt(2 * PI * PI * E / Fy);
    const limit = 4.71 * Math.sqrt(E / Fy);
    let Fcr, zone;
    if (KLr <= limit) {
      Fcr = Math.pow(0.658, Fy / Fe) * Fy;
      zone = 'inelastic';
    } else {
      Fcr = 0.877 * Fe;
      zone = 'elastic';
    }
    const Pn = Fcr * sec.A;

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
      KLr, KLr_x, KLr_y, axis, Fe, Fcr, Pn, zone, limit, Cc,
      Q: 1.0,
      qr: { Qs: 1.0, Qa: 1.0 },
      Fa, Pa_asd,
      phiPn: PHI.compress * Pn,
      phiPn_tf: PHI.compress * Pn / 1000,
      PnOmega: Pn / OMEGA.compress,
      PnOmega_tf: Pn / OMEGA.compress / 1000,
      Pa_asd_tf: Pa_asd / 1000,
    };
  }

  function calcMnRectHss(sec, Fy, axis = 'x', Lb = 0, Cb = 1.0) {
    const E = ES;
    const cls = classifyRectHssFlexure(sec, Fy, axis);
    const isXAxis = axis !== 'y';
    const flat = isXAxis ? sec.bFlat : sec.hFlat;
    const S = isXAxis ? sec.Sx : sec.Sy;
    const Z = isXAxis ? sec.Zx : sec.Zy;
    const Mp = Fy * Z;
    if (cls.web === 'slender') {
      return {
        shape: 'rhs',
        axis,
        cls,
        lambda: cls.lambdaF,
        lp: cls.lpf,
        lr: cls.lrf,
        Mp,
        Mn: 0,
        Mn_yield: Mp,
        Mn_flb: 0,
        Mn_wlb: 0,
        Mn_ltb: Mp,
        localZone: 'unsupported-web-slender',
        governing: 'OutOfScope',
        webSection: 'F7',
        sectionType: 'unsupported',
        controls: ['Yielding', 'FLB', 'WLB'],
        ltbZone: 'not_applicable',
        outOfScope: true,
        phiMn: 0,
        phiMn_tfm: 0,
        MnOmega: 0,
        MnOmega_tfm: 0,
        phiMny: 0,
        phiMny_tfm: 0,
        MnyOmega: 0,
        MnyOmega_tfm: 0,
      };
    }

    let MnFlb = Mp;
    let Se = null;
    let localZone = 'compact';
    if (cls.flange === 'non-compact') {
      const reduction = 3.57 * cls.lambdaF * Math.sqrt(Fy / E) - 4.0;
      MnFlb = Mp - (Mp - Fy * S) * reduction;
      localZone = 'noncompact-flange';
    } else if (cls.flange === 'slender') {
      const be = Math.max(0, Math.min(flat, 1.92 * sec.t * Math.sqrt(E / Fy) * (1 - 0.38 / cls.lambdaF * Math.sqrt(E / Fy))));
      Se = _calcRectHssEffectiveSe(sec, be, axis);
      MnFlb = Fy * Se;
      localZone = 'slender-flange';
    }

    let MnWlb = Mp;
    if (cls.web === 'non-compact') {
      const reduction = 0.305 * cls.lambdaW * Math.sqrt(Fy / E) - 0.738;
      MnWlb = Mp - (Mp - Fy * S) * reduction;
      if (localZone === 'compact') localZone = 'noncompact-web';
    }

    let Lp = 0;
    let Lr = 0;
    let MnLtb = Mp;
    let ltbZone = 'not_applicable';
    const CbEff = Math.max(Cb || 1.0, 0.1);
    const usesLtb = isXAxis && sec.H > sec.B + 1e-9;
    if (usesLtb) {
      const Ag = sec.A;
      const ry = sec.ry;
      const LbEff = Math.max(Lb || 0, 0);
      Lp = 0.13 * E * ry * Math.sqrt(sec.J * Ag) / Mp;
      Lr = 2 * E * ry * Math.sqrt(sec.J * Ag) / (0.7 * Fy * S);
      if (LbEff <= Lp) {
        MnLtb = Mp;
        ltbZone = 'plastic';
      } else if (LbEff <= Lr) {
        MnLtb = Math.min(CbEff * (Mp - (Mp - 0.7 * Fy * S) * ((LbEff - Lp) / (Lr - Lp))), Mp);
        ltbZone = 'inelastic';
      } else {
        MnLtb = Math.min(2 * E * CbEff * Math.sqrt(sec.J * Ag) / (LbEff / ry), Mp);
        ltbZone = 'elastic';
      }
    }

    const Mn = Math.max(0, Math.min(Mp, MnFlb, MnWlb, MnLtb));
    let governing = 'Yielding';
    if (Mn < Mp - 1e-9) {
      if (MnLtb <= MnFlb + 1e-9 && MnLtb <= MnWlb + 1e-9) governing = 'LTB';
      else if (MnWlb <= MnFlb + 1e-9) governing = 'WLB';
      else governing = 'FLB';
    }

    return {
      shape: 'rhs',
      axis,
      cls,
      lambda: cls.lambdaF,
      lp: cls.lpf,
      lr: cls.lrf,
      Mp,
      Mn_yield: Mp,
      Mn_flb: MnFlb,
      Mn_wlb: MnWlb,
      Mn_ltb: MnLtb,
      Mn,
      localZone,
      governing,
      webSection: 'F7',
      sectionType: cls.flange === 'compact' && cls.web === 'compact'
        ? 'compact'
        : cls.flange === 'slender'
          ? 'slender-flange'
          : cls.web === 'slender'
            ? 'slender-web'
            : 'noncompact',
      controls: ['Yielding', 'LTB', 'FLB', 'WLB'],
      ltbZone,
      Lp,
      Lr,
      Se,
      outOfScope: false,
      phiMn: PHI.flexure * Mn,
      phiMn_tfm: PHI.flexure * Mn / 1e5,
      MnOmega: Mn / OMEGA.flexure,
      MnOmega_tfm: Mn / OMEGA.flexure / 1e5,
      phiMny: PHI.flexure * Mn,
      phiMny_tfm: PHI.flexure * Mn / 1e5,
      MnyOmega: Mn / OMEGA.flexure,
      MnyOmega_tfm: Mn / OMEGA.flexure / 1e5,
    };
  }

  function calcMnSquareHss(sec, Fy) {
    const E = ES;
    const cls = classifySquareHssFlexure(sec, Fy);
    const lambda = cls.lambdaF;
    const lp = cls.lpf;
    const lr = cls.lrf;
    const Mp = Fy * sec.Zx;
    let MnFlb = Mp;
    let Se = null;
    let localZone = 'compact';
    if (cls.flange === 'non-compact') {
      const reduction = 3.57 * lambda * Math.sqrt(Fy / E) - 4.0;
      MnFlb = Mp - (Mp - Fy * sec.Sx) * reduction;
      localZone = 'noncompact';
    } else if (cls.flange === 'slender') {
      const be = Math.max(0, Math.min(sec.flat, 1.92 * sec.t * Math.sqrt(E / Fy) * (1 - 0.38 / lambda * Math.sqrt(E / Fy))));
      Se = _calcSquareHssEffectiveSe(sec, be);
      MnFlb = Fy * Se;
      localZone = 'slender';
    }
    const MnYield = Mp;
    const Mn = Math.max(0, Math.min(Mp, MnFlb));
    const governing = Mn < MnYield ? 'FLB' : 'Yielding';
    return {
      shape: 'shs',
      cls,
      lambda,
      lp,
      lr,
      Mp,
      Mn_yield: MnYield,
      Mn_flb: MnFlb,
      Mn_ltb: Mp,
      Mn,
      localZone,
      governing,
      webSection: 'F7',
      sectionType: cls.flange === 'compact' ? 'compact' : cls.flange === 'non-compact' ? 'noncompact' : 'slender',
      controls: cls.flange === 'compact' ? ['Yielding'] : ['Yielding', 'FLB'],
      ltbZone: 'not_applicable',
      Se,
      phiMn: PHI.flexure * Mn,
      phiMn_tfm: PHI.flexure * Mn / 1e5,
      MnOmega: Mn / OMEGA.flexure,
      MnOmega_tfm: Mn / OMEGA.flexure / 1e5,
      phiMny: PHI.flexure * Mn,
      phiMny_tfm: PHI.flexure * Mn / 1e5,
      MnyOmega: Mn / OMEGA.flexure,
      MnyOmega_tfm: Mn / OMEGA.flexure / 1e5,
    };
  }

  function calcMnRoundHss(sec, Fy) {
    const E = ES;
    const cls = classifyRoundHssFlexure(sec, Fy);
    const lambda = cls.lambdaF;
    const lp = cls.lpf;
    const lr = cls.lrf;
    const Mp = Fy * sec.Zx;
    let MnLb = Mp;
    let Fcr = null;
    let localZone = 'compact';
    if (cls.outOfScope) {
      return {
        shape: 'chs',
        cls,
        lambda,
        lp,
        lr,
        limit: cls.limit,
        Mp,
        Mn: 0,
        Mn_yield: Mp,
        Mn_flb: 0,
        Mn_ltb: Mp,
        localZone: 'unsupported',
        governing: 'OutOfScope',
        webSection: 'F8',
        sectionType: 'unsupported',
        controls: ['Yielding', 'FLB'],
        ltbZone: 'not_applicable',
        outOfScope: true,
        phiMn: 0,
        phiMn_tfm: 0,
        MnOmega: 0,
        MnOmega_tfm: 0,
        phiMny: 0,
        phiMny_tfm: 0,
        MnyOmega: 0,
        MnyOmega_tfm: 0,
      };
    }
    if (cls.flange === 'non-compact') {
      MnLb = (0.021 * E / lambda + Fy) * sec.Sx;
      localZone = 'noncompact';
    } else if (cls.flange === 'slender') {
      Fcr = 0.33 * E / lambda;
      MnLb = Fcr * sec.Sx;
      localZone = 'slender';
    }
    const Mn = Math.max(0, Math.min(Mp, MnLb));
    const governing = Mn < Mp ? 'FLB' : 'Yielding';
    return {
      shape: 'chs',
      cls,
      lambda,
      lp,
      lr,
      limit: cls.limit,
      Mp,
      Mn_yield: Mp,
      Mn_flb: MnLb,
      Mn_ltb: Mp,
      Mn,
      localZone,
      governing,
      webSection: 'F8',
      sectionType: cls.flange === 'compact' ? 'compact' : cls.flange === 'non-compact' ? 'noncompact' : 'slender',
      controls: cls.flange === 'compact' ? ['Yielding'] : ['Yielding', 'FLB'],
      ltbZone: 'not_applicable',
      Fcr,
      outOfScope: false,
      phiMn: PHI.flexure * Mn,
      phiMn_tfm: PHI.flexure * Mn / 1e5,
      MnOmega: Mn / OMEGA.flexure,
      MnOmega_tfm: Mn / OMEGA.flexure / 1e5,
      phiMny: PHI.flexure * Mn,
      phiMny_tfm: PHI.flexure * Mn / 1e5,
      MnyOmega: Mn / OMEGA.flexure,
      MnyOmega_tfm: Mn / OMEGA.flexure / 1e5,
    };
  }

  function calcRectHssShear(sec, Fy, axis = 'x') {
    const E = ES;
    const kv = 5.0;
    const h = axis === 'y' ? sec.bFlat : sec.hFlat;
    const Aw = axis === 'y' ? sec.Awy : sec.Awx;
    const ratio = h / sec.t;
    const isCompactWeb = ratio <= 2.24 * Math.sqrt(E / Fy);
    let Cv2;
    if (ratio <= 1.10 * Math.sqrt(kv * E / Fy)) {
      Cv2 = 1.0;
    } else if (ratio <= 1.37 * Math.sqrt(kv * E / Fy)) {
      Cv2 = 1.10 * Math.sqrt(kv * E / Fy) / ratio;
    } else {
      Cv2 = 1.51 * kv * E / (ratio ** 2 * Fy);
    }
    const Vn = 0.6 * Fy * Aw * Cv2;
    const phiV = isCompactWeb ? PHI.shearCompact : PHI.shear;
    const omgV = isCompactWeb ? OMEGA.shearCompact : OMEGA.shear;
    return {
      axis,
      Vn,
      Cv1: Cv2,
      Cv2,
      kv,
      h,
      Aw,
      ratio,
      isCompactWeb,
      phiV,
      phiVn: phiV * Vn,
      phiVn_tf: phiV * Vn / 1000,
      omgV,
      VnOmega: Vn / omgV,
      VnOmega_tf: Vn / omgV / 1000,
    };
  }

  function calcSquareHssShear(sec, Fy) {
    const E = ES;
    const kv = 5.0;
    const h = sec.flat;
    const ratio = h / sec.t;
    const isCompactWeb = ratio <= 2.24 * Math.sqrt(E / Fy);
    let Cv2;
    if (ratio <= 1.10 * Math.sqrt(kv * E / Fy)) {
      Cv2 = 1.0;
    } else if (ratio <= 1.37 * Math.sqrt(kv * E / Fy)) {
      Cv2 = 1.10 * Math.sqrt(kv * E / Fy) / ratio;
    } else {
      Cv2 = 1.51 * kv * E / (ratio ** 2 * Fy);
    }
    const Vn = 0.6 * Fy * sec.Aw * Cv2;
    const phiV = isCompactWeb ? PHI.shearCompact : PHI.shear;
    const omgV = isCompactWeb ? OMEGA.shearCompact : OMEGA.shear;
    return {
      Vn,
      Cv1: Cv2,
      Cv2,
      kv,
      h,
      ratio,
      isCompactWeb,
      phiV,
      phiVn: phiV * Vn,
      phiVn_tf: phiV * Vn / 1000,
      omgV,
      VnOmega: Vn / omgV,
      VnOmega_tf: Vn / omgV / 1000,
    };
  }

  function calcRoundHssShear(sec, Fy, Lv) {
    const E = ES;
    const Ag = sec.A;
    const ratio = sec.D / sec.t;
    const LvEff = Math.max(Lv || sec.D / 2, sec.D / 2);
    const buckling1 = 1.60 * E / (Math.sqrt(LvEff / sec.D) * ratio ** 1.25);
    const buckling2 = 0.78 * E / ratio ** 1.5;
    const Fcr = Math.min(0.6 * Fy, Math.max(buckling1, buckling2));
    const Vn = Fcr * Ag / 2;
    const yieldingControls = Fcr >= 0.6 * Fy - 1e-9;
    const phiV = yieldingControls ? PHI.shearCompact : PHI.shear;
    const omgV = yieldingControls ? OMEGA.shearCompact : OMEGA.shear;
    return {
      Vn,
      Fcr,
      Ag,
      Lv: LvEff,
      ratio,
      buckling1,
      buckling2,
      yieldingControls,
      phiV,
      phiVn: phiV * Vn,
      phiVn_tf: phiV * Vn / 1000,
      omgV,
      VnOmega: Vn / omgV,
      VnOmega_tf: Vn / omgV / 1000,
    };
  }

  // ── 匯出 ──
  global.Steel = {
    ES, G, FY_OPTIONS, PHI, OMEGA,
    H_SECTIONS_MM,
    SHS_SECTIONS_MM,
    RHS_SECTIONS_MM,
    CHS_SECTIONS_MM,
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
    calcSquareHssProps,
    calcRectHssProps,
    calcRoundHssProps,
    classifyRectHssFlexure,
    classifySquareHssFlexure,
    classifyRoundHssFlexure,
    classifyRectHssCompression,
    classifySquareHssCompression,
    classifyRoundHssCompression,
    calcPnNonslender,
    calcMnRectHss,
    calcMnSquareHss,
    calcMnRoundHss,
    calcRectHssShear,
    calcSquareHssShear,
    calcRoundHssShear,
  };
})(window);
