// Build the Group 1 build-plan deck: node tools/build_slides.js
// Needs pptxgenjs (npm install pptxgenjs, or set NODE_PATH to an install).
const path = require("path");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const A = (f) => path.join(ROOT, "docs/assets", f);
const OUT = path.join(ROOT, "docs/AOOP_Group1_Build_Plan.pptx");

const FONT = "Microsoft JhengHei";
const C = {
  jungle: "1E3B2C", // dark green, dominant on dark slides
  leaf: "3E7C4F",
  banana: "F2C230", // accent
  ink: "1F2421",
  muted: "5B645E",
  tint: "EEF4EF", // card background on light slides
  white: "FFFFFF",
};

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "AOOP_Final_Project_Group_1 建置計畫";
pres.author = "AOOP 第 1 組";
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

const text = (s, t, o) => s.addText(t, { fontFace: FONT, isTextBox: true, margin: 0, ...o });

function contentSlide(title, num) {
  const s = pres.addSlide();
  s.background = { color: C.white };
  text(s, title, { x: 0.5, y: 0.35, w: 9, h: 0.6, fontSize: 28, bold: true, color: C.jungle });
  text(s, `${num}`, { x: 9.1, y: 5.15, w: 0.4, h: 0.3, fontSize: 10, color: C.muted, align: "right" });
  return s;
}

function card(s, x, y, w, h, head, body, opts = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.08, fill: { color: opts.fill || C.tint }, line: { color: opts.fill || C.tint },
  });
  text(s, head, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.4, fontSize: 16, bold: true, color: opts.headColor || C.jungle });
  text(s, body, { x: x + 0.2, y: y + 0.6, w: w - 0.4, h: h - 0.75, fontSize: 13, color: opts.color || C.ink, valign: "top", paraSpaceAfter: 4 });
}

function arrow(s, x, y, w) {
  s.addShape(pres.shapes.RIGHT_ARROW, { x, y, w, h: 0.28, fill: { color: C.banana }, line: { color: C.banana } });
}

// 1. Title
{
  const s = pres.addSlide();
  s.background = { color: C.jungle };
  s.addImage({ path: A("game-raid.jpg"), x: 5.2, y: 0, w: 4.8, h: 5.625, sizing: { type: "cover", w: 4.8, h: 5.625 } });
  text(s, "AOOP 期末專題 · 第 1 組", { x: 0.5, y: 0.6, w: 4.4, h: 0.4, fontSize: 14, color: C.banana, bold: true });
  text(s, "AOOP_Final_Project_Group_1", { x: 0.5, y: 1.15, w: 4.6, h: 0.5, fontSize: 18, bold: true, color: "CFE0D3" });
  text(s, "Monkey Businessman", { x: 0.5, y: 1.65, w: 4.6, h: 0.75, fontSize: 28, bold: true, color: C.white });
  text(s, "一款俯視角的卡通撤離射擊遊戲", { x: 0.5, y: 2.45, w: 4.4, h: 0.4, fontSize: 14, color: "CFE0D3" });
  text(s, "建置計畫：我們要做什麼、打算怎麼做", { x: 0.5, y: 3.0, w: 4.4, h: 0.5, fontSize: 16, color: C.banana });
  text(s, "劉育麟 112511002　張倖嘉 112511004　譚羽良 112511017", { x: 0.5, y: 4.7, w: 4.6, h: 0.4, fontSize: 11, color: "CFE0D3" });
  s.addNotes("開場：介紹組員與專題，接著說明要做的遊戲和建置方式。");
}

// 2. What we are making: the loop
{
  const s = contentSlide("我們要做什麼", 2);
  text(s, "玩家是一隻穿西裝的猴子商人。進叢林搜刮，走得越深收穫越多；被打倒就會掉東西，所以要自己決定什麼時候撤離。",
    { x: 0.5, y: 1.05, w: 9, h: 0.7, fontSize: 15, color: C.ink });
  const steps = ["出發", "搜刮", "戰鬥", "撤離", "回家升級"];
  const w = 1.4, gap = 0.5, x0 = 0.5;
  steps.forEach((t, i) => {
    const x = x0 + i * (w + gap);
    s.addShape(pres.shapes.OVAL, { x, y: 2.05, w, h: w, fill: { color: i === 3 ? C.banana : C.jungle }, line: { color: i === 3 ? C.banana : C.jungle } });
    text(s, t, { x, y: 2.05, w, h: w, fontSize: 16, bold: true, align: "center", valign: "middle", color: i === 3 ? C.ink : C.white });
    if (i < steps.length - 1) arrow(s, x + w + 0.08, 2.05 + w / 2 - 0.14, gap - 0.16);
  });
  text(s, "↻ 升級後的裝備讓下一趟走得更深", { x: 0.5, y: 3.65, w: 9, h: 0.4, fontSize: 13, color: C.muted, italic: true });
  text(s, "目標：在瀏覽器上完成這個循環，並用它練習類別階層、介面與多型。",
    { x: 0.5, y: 4.3, w: 9, h: 0.5, fontSize: 15, bold: true, color: C.leaf });
  s.addNotes("一趟遊戲大約 4 到 8 分鐘。撤離是核心決定：多拿一點，還是先回家。");
}

// 3. Tools and starting point
{
  const s = contentSlide("用什麼做、做哪些部分", 3);
  card(s, 0.5, 1.2, 2.8, 2.9, "技術", "TypeScript\nThree.js（3D 繪圖）\nVite（建置）\n瀏覽器直接遊玩");
  card(s, 3.55, 1.2, 2.85, 2.9, "遊戲系統", "角色與戰鬥\n敵人 AI\n搜刮與背包\n基地與存檔");
  card(s, 6.65, 1.2, 2.85, 2.9, "這學期要完成", "類別架構與核心系統\n介面模組\n音效模組\n整合、測試、展示",
    { fill: C.jungle, headColor: C.banana, color: C.white });
}

// 4. Class architecture
{
  const s = contentSlide("類別架構", 4);
  s.addImage({ path: A("slide-classes.png"), x: 0.9, y: 1.0, w: 6.6, h: 2.77 });
  text(s, "空心箭頭：繼承\n虛線：實作介面\n完整類別圖見提案", { x: 7.8, y: 1.3, w: 1.7, h: 1.2, fontSize: 11, color: C.muted, valign: "top" });
  const cols = [
    ["繼承", "敵人共用 Actor 的血量與受傷規則"],
    ["多型", "RaidScene 對每個實體呼叫 update(dt)"],
    ["介面", "新場景實作 GameScene 就能接上"],
    ["資料驅動", "槍和物品是設定資料，加新武器不改類別"],
  ];
  cols.forEach(([h, b], i) => {
    const x = 0.5 + i * 2.3;
    s.addShape(pres.shapes.OVAL, { x, y: 4.05, w: 0.28, h: 0.28, fill: { color: C.banana }, line: { color: C.banana } });
    text(s, h, { x: x + 0.4, y: 4.0, w: 1.7, h: 0.38, fontSize: 15, bold: true, color: C.jungle });
    text(s, b, { x, y: 4.45, w: 2.1, h: 0.75, fontSize: 12, color: C.ink, valign: "top" });
  });
}

// 5. How modules talk: EventBus
{
  const s = contentSlide("模組之間怎麼溝通", 5);
  text(s, "戰鬥程式不直接呼叫介面或音效，只發出事件；介面和音效各自訂閱。三個人可以平行開發，互不卡住。",
    { x: 0.5, y: 1.0, w: 9, h: 0.6, fontSize: 14, color: C.ink });
  const box = (x, y, w, h, head, sub, fill, fg) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill } });
    text(s, head, { x, y: y + 0.18, w, h: 0.4, fontSize: 16, bold: true, align: "center", color: fg });
    text(s, sub, { x: x + 0.1, y: y + 0.6, w: w - 0.2, h: h - 0.7, fontSize: 12, align: "center", color: fg });
  };
  box(0.5, 2.4, 2.4, 1.4, "戰鬥 / Player", "子彈命中敵人", C.tint, C.ink);
  arrow(s, 3.0, 2.96, 0.6);
  box(3.7, 2.4, 2.4, 1.4, "EventBus", 'emit("hit", 傷害, 位置)', C.banana, C.ink);
  arrow(s, 6.2, 2.15, 0.6);
  arrow(s, 6.2, 3.8, 0.6);
  box(6.9, 1.75, 2.6, 1.15, "UIManager", "更新血條、跳出傷害數字", C.jungle, C.white);
  box(6.9, 3.35, 2.6, 1.15, "AudioManager", "播放受擊音效", C.jungle, C.white);
  text(s, "觀察者模式：要加新的反應（例如鏡頭震動），只要再訂閱一次，不用改戰鬥程式。",
    { x: 0.5, y: 4.8, w: 9, h: 0.4, fontSize: 12, color: C.muted });
}

// 6. Who does what
{
  const s = contentSlide("分工", 6);
  const people = [
    ["張倖嘉", "介面模組", "UIManager、UI 面板\n主選單、暫停選單、HUD、背包與戰利品介面、地圖"],
    ["劉育麟", "音效模組", "AudioManager、SoundBank\nSFX 整理與命名、事件對應、背景音樂、音量"],
    ["譚羽良", "遊戲核心與整合", "類別階層、戰鬥與武器、敵人 AI、搜刮、存檔\n系統整合、程式審查"],
  ];
  people.forEach(([name, role, body], i) => {
    const x = 0.5 + i * 3.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.2, w: 2.85, h: 3.2, rectRadius: 0.08, fill: { color: C.tint }, line: { color: C.tint } });
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: 1.4, w: 0.55, h: 0.55, fill: { color: C.jungle }, line: { color: C.jungle } });
    text(s, `${i + 1}`, { x: x + 0.2, y: 1.4, w: 0.55, h: 0.55, fontSize: 16, bold: true, align: "center", valign: "middle", color: C.banana });
    text(s, name, { x: x + 0.2, y: 2.1, w: 2.5, h: 0.4, fontSize: 16, bold: true, color: C.jungle });
    text(s, role, { x: x + 0.2, y: 2.5, w: 2.5, h: 0.35, fontSize: 13, bold: true, color: C.leaf });
    text(s, body, { x: x + 0.2, y: 2.95, w: 2.5, h: 1.8, fontSize: 12, color: C.ink, valign: "top", paraSpaceAfter: 4 });
  });
}

// 7. Timeline
{
  const s = contentSlide("時程", 7);
  const phases = [
    ["第 1–2 週", "骨架", "Entity、Actor、Item 類別\nEventBus、GameScene"],
    ["第 3–4 週", "模組", "UI 面板、AudioManager\n接上遊戲事件"],
    ["第 5–6 週", "遊戲內容", "敵人 AI 狀態、武器\n搜刮、存檔重構"],
    ["第 7–8 週", "收尾", "整合、修 bug\n試玩與展示"],
  ];
  s.addShape(pres.shapes.LINE, { x: 0.8, y: 1.9, w: 8.4, h: 0, line: { color: C.leaf, width: 2 } });
  phases.forEach(([wk, head, body], i) => {
    const x = 0.5 + i * 2.3;
    s.addShape(pres.shapes.OVAL, { x: x + 0.15, y: 1.75, w: 0.3, h: 0.3, fill: { color: C.banana }, line: { color: C.jungle, width: 1.5 } });
    text(s, wk, { x, y: 1.25, w: 2.1, h: 0.35, fontSize: 12, color: C.muted });
    card(s, x, 2.3, 2.1, 2.5, head, body);
  });
  text(s, "每個階段結束都要能跑起完整的一趟遊戲。", { x: 0.5, y: 4.95, w: 9, h: 0.3, fontSize: 12, color: C.muted });
}

// 8. How we work and check
{
  const s = contentSlide("開發與驗證方式", 8);
  const flow = ["Issue", "分支", "Pull Request", "互相審查", "合併"];
  const w = 1.45, gap = 0.44;
  flow.forEach((t, i) => {
    const x = 0.5 + i * (w + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.3, w, h: 0.8, rectRadius: 0.08, fill: { color: C.jungle }, line: { color: C.jungle } });
    text(s, t, { x, y: 1.3, w, h: 0.8, fontSize: 15, bold: true, align: "center", valign: "middle", color: C.white });
    if (i < flow.length - 1) arrow(s, x + w + 0.06, 1.56, gap - 0.12);
  });
  card(s, 0.5, 2.6, 4.35, 2.2, "Commit 規則", "每人用自己的帳號，平均分散提交\n一個 commit 一件實際改動\n不在截止前一次大量提交");
  card(s, 5.15, 2.6, 4.35, 2.2, "怎麼確認沒壞", "存檔、結算有單元測試\n自動試玩機器人跑完整一趟\n合併前在瀏覽器實際玩過");
}

pres.writeFile({ fileName: OUT }).then((f) => {
  // Drop ZIP folder entries; cloud viewers (Drive, OneDrive) can fail on them.
  require("child_process").spawnSync("zip", ["-dq", OUT, "*/"]);
  console.log("wrote", f);
});
