// Build the Group 1 build-plan deck: node tools/build_slides.js
// Needs pptxgenjs (npm install pptxgenjs, or set NODE_PATH to an install).
// Speaker notes on each slide hold the talk script.
const path = require("path");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const A = (f) => path.join(ROOT, "docs/assets", f);
const OUT = path.join(ROOT, "docs/AOOP_Group1_Build_Plan.pptx");

const FONT = "Microsoft JhengHei";
const C = {
  jungle: "1E3B2C",
  leaf: "3E7C4F",
  banana: "F2C230",
  ink: "1F2421",
  muted: "5B645E",
  tint: "EEF4EF",
  white: "FFFFFF",
  pale: "CFE0D3",
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
  text(s, head, { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.4, fontSize: 17, bold: true, color: opts.headColor || C.jungle });
  text(s, body, { x: x + 0.25, y: y + 0.7, w: w - 0.5, h: h - 0.85, fontSize: 14, color: opts.color || C.ink, valign: "top", paraSpaceAfter: 6 });
}

function arrow(s, x, y, w) {
  s.addShape(pres.shapes.RIGHT_ARROW, { x, y, w, h: 0.28, fill: { color: C.banana }, line: { color: C.banana } });
}

// 1. Title
{
  const s = pres.addSlide();
  s.background = { color: C.jungle };
  [[7.2, 0.7, 1.6], [8.3, 2.4, 1.0], [6.9, 3.3, 0.6]].forEach(([x, y, d]) =>
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: C.banana, transparency: 15 }, line: { color: C.banana, transparency: 15 } }));
  text(s, "AOOP 期末專題 · 第 1 組", { x: 0.6, y: 1.0, w: 6, h: 0.4, fontSize: 14, color: C.banana, bold: true });
  text(s, "AOOP_Final_Project_Group_1", { x: 0.6, y: 1.6, w: 6.2, h: 0.8, fontSize: 30, bold: true, color: C.white });
  text(s, "俯視角撤離射擊遊戲 · 建置計畫", { x: 0.6, y: 2.5, w: 6, h: 0.5, fontSize: 18, color: C.pale });
  text(s, "劉育麟 112511002　張倖嘉 112511004　譚羽良 112511017", { x: 0.6, y: 4.6, w: 6.5, h: 0.4, fontSize: 12, color: C.pale });
  s.addNotes("大家好，我們是第 1 組。我們的期末專題是一款俯視角的撤離射擊遊戲。今天會說明我們要做什麼、參考了什麼，以及打算怎麼用物件導向的方式把它做出來。");
}

// 2. Inspiration
{
  const s = contentSlide("靈感來源：Escape from Duckov", 2);
  s.addImage({ path: A("inspo-raid.jpg"), x: 0.5, y: 1.15, w: 4.4, h: 2.475 });
  s.addImage({ path: A("inspo-loot.jpg"), x: 5.1, y: 1.15, w: 4.4, h: 2.475 });
  const tags = ["俯視角射擊", "搜刮與撤離", "回基地升級"];
  tags.forEach((t, i) => {
    const x = 0.5 + i * 3.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.9, w: 2.85, h: 0.6, rectRadius: 0.3, fill: { color: C.jungle }, line: { color: C.jungle } });
    text(s, t, { x, y: 3.9, w: 2.85, h: 0.6, fontSize: 16, bold: true, align: "center", valign: "middle", color: C.white });
  });
  text(s, "借鏡玩法結構，角色、地圖與美術都自己做", { x: 0.5, y: 4.75, w: 8.5, h: 0.35, fontSize: 14, color: C.leaf, bold: true });
  text(s, "圖片：Escape from Duckov 遊戲畫面", { x: 5.1, y: 3.65, w: 4.4, h: 0.2, fontSize: 9, color: C.muted, align: "right" });
  s.addNotes("我們的靈感來自 Escape from Duckov。它是一款俯視角的撤離射擊遊戲：玩家進入地圖搜刮物資、和敵人戰鬥，再決定什麼時候撤離，把東西帶回基地升級。我們喜歡這個「要不要再冒險一點」的玩法，所以參考它的玩法結構，但角色、地圖、美術和程式全部是我們自己做的原創遊戲。");
}

// 3. The loop
{
  const s = contentSlide("我們的遊戲", 3);
  const steps = ["出發", "搜刮", "戰鬥", "撤離", "升級"];
  const w = 1.4, gap = 0.5, x0 = 0.5;
  steps.forEach((t, i) => {
    const x = x0 + i * (w + gap);
    const hot = i === 3;
    s.addShape(pres.shapes.OVAL, { x, y: 1.6, w, h: w, fill: { color: hot ? C.banana : C.jungle }, line: { color: hot ? C.banana : C.jungle } });
    text(s, t, { x, y: 1.6, w, h: w, fontSize: 18, bold: true, align: "center", valign: "middle", color: hot ? C.ink : C.white });
    if (i < steps.length - 1) arrow(s, x + w + 0.08, 1.6 + w / 2 - 0.14, gap - 0.16);
  });
  text(s, "走得越深收穫越多，被打倒就會掉東西", { x: 0.5, y: 3.5, w: 9, h: 0.5, fontSize: 18, bold: true, color: C.leaf, align: "center" });
  text(s, "瀏覽器直接遊玩", { x: 0.5, y: 4.1, w: 9, h: 0.4, fontSize: 14, color: C.muted, align: "center" });
  s.addNotes("遊戲的核心是一個循環：出發、搜刮、戰鬥、撤離、回家升級。走得越深，能拿到的東西越好，但被打倒就會失去背包裡的東西，所以撤離的時機是玩家最重要的決定。升級後的裝備讓下一趟可以走得更遠。遊戲在瀏覽器上就能玩。");
}

// 4. Tools and scope
{
  const s = contentSlide("技術與範圍", 4);
  card(s, 0.5, 1.2, 2.8, 3.0, "技術", "TypeScript\nThree.js\nVite");
  card(s, 3.55, 1.2, 2.85, 3.0, "遊戲系統", "角色與戰鬥\n敵人 AI\n搜刮與背包\n基地與存檔");
  card(s, 6.65, 1.2, 2.85, 3.0, "這學期完成", "類別架構\n介面模組\n音效模組\n整合與展示",
    { fill: C.jungle, headColor: C.banana, color: C.white });
  s.addNotes("技術上我們用 TypeScript 和 Three.js 做 3D 畫面，用 Vite 建置。遊戲系統包含角色與戰鬥、敵人 AI、搜刮與背包、基地與存檔。這學期的重點是把這些系統整理成清楚的類別架構，並完成介面和音效模組。");
}

// 5. Class architecture
{
  const s = contentSlide("類別架構", 5);
  s.addImage({ path: A("slide-classes.png"), x: 0.9, y: 1.05, w: 6.6, h: 2.77 });
  text(s, "空心箭頭：繼承\n虛線：實作介面", { x: 7.8, y: 1.3, w: 1.7, h: 0.8, fontSize: 11, color: C.muted, valign: "top" });
  const cols = [["繼承", "敵人共用 Actor"], ["多型", "統一呼叫 update()"], ["介面", "新場景直接接上"], ["資料驅動", "加武器不改類別"]];
  cols.forEach(([h, b], i) => {
    const x = 0.5 + i * 2.3;
    s.addShape(pres.shapes.OVAL, { x, y: 4.1, w: 0.28, h: 0.28, fill: { color: C.banana }, line: { color: C.banana } });
    text(s, h, { x: x + 0.4, y: 4.05, w: 1.7, h: 0.38, fontSize: 16, bold: true, color: C.jungle });
    text(s, b, { x, y: 4.5, w: 2.1, h: 0.4, fontSize: 13, color: C.ink });
  });
  s.addNotes("這是我們的類別架構。所有會動的東西都繼承 Entity；玩家和敵人繼承 Actor，共用血量和受傷規則；不同的敵人再繼承 Enemy。物品這邊，武器、消耗品、裝備都繼承 Item，近戰和槍再繼承 Weapon。場景實作 GameScene 介面。這樣遊戲迴圈只要對每個物件呼叫 update，就是多型。槍和物品的數值寫成設定資料，新增武器不用改類別。");
}

// 6. EventBus
{
  const s = contentSlide("模組之間怎麼溝通", 6);
  const box = (x, y, w, h, head, sub, fill, fg) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill } });
    text(s, head, { x, y: y + 0.2, w, h: 0.4, fontSize: 17, bold: true, align: "center", color: fg });
    text(s, sub, { x: x + 0.1, y: y + 0.65, w: w - 0.2, h: h - 0.75, fontSize: 13, align: "center", color: fg });
  };
  box(0.5, 2.0, 2.4, 1.4, "戰鬥", "子彈命中", C.tint, C.ink);
  arrow(s, 3.0, 2.56, 0.6);
  box(3.7, 2.0, 2.4, 1.4, "EventBus", 'emit("hit")', C.banana, C.ink);
  arrow(s, 6.2, 1.75, 0.6);
  arrow(s, 6.2, 3.4, 0.6);
  box(6.9, 1.35, 2.6, 1.15, "UIManager", "更新血條", C.jungle, C.white);
  box(6.9, 2.95, 2.6, 1.15, "AudioManager", "播放音效", C.jungle, C.white);
  text(s, "觀察者模式：模組互不相依，三人可平行開發", { x: 0.5, y: 4.55, w: 9, h: 0.4, fontSize: 15, bold: true, color: C.leaf });
  s.addNotes("模組之間用 EventBus 溝通，也就是觀察者模式。例如子彈打中敵人時，戰鬥程式只發出一個 hit 事件，不直接呼叫介面或音效。介面收到事件就更新血條，音效收到事件就播放受擊聲。這樣三個模組彼此不相依，我們三個人可以同時開發，不會互相卡住。");
}

// 7. Roles
{
  const s = contentSlide("分工", 7);
  const people = [
    ["張倖嘉", "介面模組", "選單、HUD\n背包、地圖"],
    ["劉育麟", "音效模組", "音效、背景音樂\n音量設定"],
    ["譚羽良", "遊戲核心與整合", "角色、戰鬥、AI\n搜刮、存檔"],
  ];
  people.forEach(([name, role, body], i) => {
    const x = 0.5 + i * 3.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.2, w: 2.85, h: 3.0, rectRadius: 0.08, fill: { color: C.tint }, line: { color: C.tint } });
    s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 1.45, w: 0.55, h: 0.55, fill: { color: C.jungle }, line: { color: C.jungle } });
    text(s, `${i + 1}`, { x: x + 0.25, y: 1.45, w: 0.55, h: 0.55, fontSize: 16, bold: true, align: "center", valign: "middle", color: C.banana });
    text(s, name, { x: x + 0.25, y: 2.15, w: 2.4, h: 0.45, fontSize: 18, bold: true, color: C.jungle });
    text(s, role, { x: x + 0.25, y: 2.6, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: C.leaf });
    text(s, body, { x: x + 0.25, y: 3.1, w: 2.4, h: 0.9, fontSize: 14, color: C.ink, valign: "top" });
  });
  s.addNotes("分工上，張倖嘉負責介面模組，包含選單、HUD、背包和地圖介面。劉育麟負責音效模組，包含音效、背景音樂和音量設定。譚羽良負責遊戲核心，包含角色、戰鬥、敵人 AI、搜刮和存檔，以及最後的系統整合。");
}

// 8. Timeline
{
  const s = contentSlide("時程", 8);
  const phases = [["第 1–2 週", "骨架", "類別架構\nEventBus"], ["第 3–4 週", "模組", "介面\n音效"], ["第 5–6 週", "內容", "敵人 AI\n搜刮、存檔"], ["第 7–8 週", "收尾", "整合\n展示"]];
  s.addShape(pres.shapes.LINE, { x: 0.8, y: 1.9, w: 8.4, h: 0, line: { color: C.leaf, width: 2 } });
  phases.forEach(([wk, head, body], i) => {
    const x = 0.5 + i * 2.3;
    s.addShape(pres.shapes.OVAL, { x: x + 0.15, y: 1.75, w: 0.3, h: 0.3, fill: { color: C.banana }, line: { color: C.jungle, width: 1.5 } });
    text(s, wk, { x, y: 1.25, w: 2.1, h: 0.35, fontSize: 13, color: C.muted });
    card(s, x, 2.3, 2.1, 2.0, head, body);
  });
  s.addNotes("時程大約八週。前兩週建立類別架構和 EventBus；第三、四週完成介面和音效模組；第五、六週做敵人 AI、搜刮和存檔；最後兩週整合、修 bug，準備展示。每個階段結束時，遊戲都要能完整玩一趟。");
}

// 9. Workflow
{
  const s = contentSlide("開發方式", 9);
  const flow = ["Issue", "分支", "Pull Request", "審查", "合併"];
  const w = 1.45, gap = 0.44;
  flow.forEach((t, i) => {
    const x = 0.5 + i * (w + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.6, w, h: 0.9, rectRadius: 0.08, fill: { color: C.jungle }, line: { color: C.jungle } });
    text(s, t, { x, y: 1.6, w, h: 0.9, fontSize: 16, bold: true, align: "center", valign: "middle", color: C.white });
    if (i < flow.length - 1) arrow(s, x + w + 0.06, 1.91, gap - 0.12);
  });
  text(s, "每人用自己的帳號，持續小量提交", { x: 0.5, y: 3.2, w: 9, h: 0.45, fontSize: 18, bold: true, color: C.leaf, align: "center" });
  text(s, "單元測試 + 自動試玩確認沒壞", { x: 0.5, y: 3.8, w: 9, h: 0.45, fontSize: 16, color: C.muted, align: "center" });
  s.addNotes("開發流程上，每項工作先開 Issue，在自己的分支完成，再發 Pull Request 讓組員審查後合併。每個人用自己的 GitHub 帳號持續小量提交。存檔和結算有單元測試，另外有自動試玩程式確認每次修改後遊戲還能完整跑完。以上是我們的報告，謝謝大家。");
}

pres.writeFile({ fileName: OUT }).then((f) => {
  // Drop ZIP folder entries; cloud viewers (Drive, OneDrive) can fail on them.
  require("child_process").spawnSync("zip", ["-dq", OUT, "*/"]);
  console.log("wrote", f);
});
