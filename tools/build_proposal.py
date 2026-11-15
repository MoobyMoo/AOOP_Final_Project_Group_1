#!/usr/bin/env python3
"""Fill the retained AOOP DOCX template, preserving unrelated package parts."""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import subprocess

from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "docs/templates/AOOP_Final_Project_Proposal_第X組.docx"
OUTPUT = ROOT / "docs/AOOP_Final_Project_Proposal_第1組.docx"
ASSETS = ROOT / "docs/assets"
QA = ROOT / "work/proposal-template-2026-11-08/qa"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"w": W}


def tag(local):
    return f"{{{W}}}{local}"


def main():
    ASSETS.mkdir(exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["dot", "-Tpng", "-Gdpi=240", str(ASSETS / "proposal-architecture.dot"),
         "-o", str(ASSETS / "proposal-architecture.png")], check=True
    )
    with ZipFile(REFERENCE) as archive:
        original = {item.filename: archive.read(item) for item in archive.infolist()}
        infos = archive.infolist()

    document = etree.fromstring(original["word/document.xml"])
    body = document.find("w:body", NS)
    source = body.findall("w:p", NS)
    section = deepcopy(body.find("w:sectPr", NS))
    body_run = deepcopy(source[5].find("w:r/w:rPr", NS))
    color = body_run.find("w:color", NS)
    if color is not None:
        color.attrib.clear()
        color.set(tag("val"), "000000")

    def run(text, props=body_run):
        node = etree.Element(tag("r"))
        node.append(deepcopy(props))
        text_node = etree.SubElement(node, tag("t"))
        text_node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        text_node.text = text
        return node

    def paragraph(text, keep=False):
        node = etree.Element(tag("p"))
        props = deepcopy(source[0].find("w:pPr", NS))
        for item in list(props):
            if item.tag == tag("rPr"):
                props.remove(item)
        if keep:
            etree.SubElement(props, tag("keepNext"))
        node.append(props)
        node.append(run(text))
        return node

    def heading(index, label, page_break=False):
        node = deepcopy(source[index])
        for item in list(node):
            if item.tag != tag("pPr"):
                node.remove(item)
        props = node.find("w:pPr", NS)
        for inherited_color in props.findall("w:rPr/w:color", NS):
            inherited_color.attrib.clear()
            inherited_color.set(tag("val"), "000000")
        etree.SubElement(props, tag("keepNext"))
        if page_break:
            etree.SubElement(props, tag("pageBreakBefore"))
        heading_props = deepcopy(source[index].find("w:r/w:rPr", NS))
        c = heading_props.find("w:color", NS)
        if c is not None:
            heading_props.remove(c)
        node.append(run(label, heading_props))
        return node

    for item in list(body):
        body.remove(item)

    body.append(heading(0, "專題名稱：AOOP_Final_Project_Group_1"))
    body.append(heading(1, "小組成員：第 1 組"))
    body.append(paragraph("劉育麟 112511002　張倖嘉 112511004　譚羽良 112511017"))
    body.append(heading(2, "專題動機與目標"))
    body.append(paragraph(
        "我們要做一款俯視角的卡通撤離射擊遊戲。玩家是一隻破產、穿西裝的猴子商人，"
        "從海灘碉堡出發，進入叢林搜刮香蕉、零件和寶物，一路對付搶匪與野生動物，"
        "並自己決定什麼時候撤離：走得越深收穫越多，但被打倒就會失去背包裡沒保住的東西。"
        "帶回家的戰利品可以出售、升級裝備、完成委託，讓下一趟出發更強。"
    ))
    body.append(paragraph(
        "目標是完成一個可在瀏覽器遊玩的完整循環：出發、搜刮、戰鬥、撤離、回家升級。"
        "這類遊戲同時有許多種敵人、武器、物品與場景，很適合用類別階層、介面與多型來組織，"
        "也容易分工給三位組員各自負責一個模組。"
    ))
    body.append(paragraph(
        "技術採用 TypeScript 與 Three.js，以 Vite 建置，在瀏覽器執行。本專題僅用於 AOOP 課程繳交。"
    ))
    body.append(heading(3, "核心功能與範圍"))
    for text in [
        "角色與戰鬥：移動、滑鼠瞄準、閃避翻滾、體力；公事包近戰與多種槍械；命中、爆頭與護甲計算。",
        "敵人 AI：搶匪、猩猩、Boss 等敵人各有不同行為，以狀態（巡邏、追擊、攻擊、逃跑）切換。",
        "搜刮與背包：搜索容器、物品稀有度、背包與安全口袋、負重狀態、撤離點與倒地懲罰。",
        "基地與進度：出售戰利品、工作台升級、委託任務、存檔與讀檔。",
        "介面與選單：主選單、暫停選單、HUD（血量、彈藥、體力）、背包與戰利品介面、地圖。",
        "音效系統：槍聲、腳步、受擊、介面音效與背景音樂，依遊戲事件播放，可調整音量。",
    ]:
        body.append(paragraph(text))
    body.append(heading(4, "系統架構與程式骨幹"))
    body.append(heading(5, "系統架構圖："))

    # Transfer only an inline drawing from a temporary python-docx object.
    # Preserve the retained template's remaining XML and package parts.
    from docx import Document
    from docx.shared import Inches
    temporary = Document()
    image_run = temporary.add_paragraph().add_run()
    image_run.add_picture(str(ASSETS / "proposal-architecture.png"), width=Inches(5.6))
    drawing = deepcopy(image_run._r.find(tag("drawing")))
    drawing.xpath(".//*[local-name()='blip']")[0].set(f"{{{R}}}embed", "rIdAOOPArchitecture")
    docpr = drawing.xpath(".//*[local-name()='docPr']")[0]
    docpr.set("descr", "遊戲類別圖：場景、角色與 AI、物品與戰鬥、介面音效與存檔。")
    diagram = paragraph("", keep=True)
    etree.SubElement(diagram, tag("r")).append(drawing)
    body.append(diagram)
    body.append(paragraph("圖 1　遊戲類別圖（空心箭頭為繼承或實作，實心菱形為組合，綠色點線為事件與存檔）。"))
    body.append(heading(6, "物件導向設計說明："))
    for text in [
        "封裝：Actor 自己管理血量、體力與受傷規則，外部只呼叫 takeDamage(hit)；"
        "Inventory 管理格子與重量，介面只透過它的方法讀取，不直接改資料。",
        "繼承與多型：Entity → Actor → Player／Enemy → Bandit、Gorilla、Boss；Item → Weapon、Consumable、Wearable。"
        "RaidScene 每一幀對所有實體呼叫 update(dt)，不需要知道是哪一種；"
        "Weapon.attack() 由近戰武器與槍各自實作。",
        "介面：GameScene（HomeScene、RaidScene）、AIState、Serializable 定義共同的契約，"
        "新增場景、敵人行為或可存檔的物件時，只要實作介面即可接上。",
        "設計模式：敵人 AI 用狀態模式；EventBus 用觀察者模式，戰鬥發出「命中」「撿取」等事件，"
        "UIManager 與 AudioManager 訂閱後各自反應，三個模組彼此不直接相依，方便三人平行開發。",
        "資料驅動與維護：槍械數值、物品與掉落表寫成設定資料（GunData、LootTable），"
        "新增一把槍或一種物品不需修改類別；存檔與結算邏輯附有單元測試，"
        "另有自動試玩機器人檢查每次修改後遊戲仍能完整跑完。",
    ]:
        body.append(paragraph(text))
    body.append(heading(7, "成員分工"))
    for text in [
        "張倖嘉／112511004：介面模組（UIManager 與各 UI 面板）：主選單、暫停選單、HUD、"
        "背包與戰利品介面、地圖介面；透過 EventBus 取得資料，不直接修改遊戲狀態。",
        "劉育麟／112511002：音效模組（AudioManager、SoundBank）：SFX 素材整理與命名、"
        "事件與音效的對應、背景音樂切換、音量設定。",
        "譚羽良／112511017：遊戲核心：Entity／Actor 類別階層、戰鬥與武器、敵人 AI、搜刮與存檔，"
        "負責系統整合、架構圖維護與程式審查。",
    ]:
        body.append(paragraph(text))
    body.append(paragraph(
        "三人各自用自己的 GitHub 帳號在分支提交，以 Pull Request 合併。"
    ))
    body.append(heading(8, "Repo 連結"))
    link_para = paragraph("")
    link = etree.SubElement(link_para, tag("hyperlink"))
    link.set(f"{{{R}}}id", "rIdAOOPRepository")
    link.append(run("https://github.com/MoobyMoo/AOOP_Final_Project_Group_1/"))
    body.append(link_para)
    body.append(paragraph(
        "Repo 已公開。目前收錄提案、架構圖與組員資料，接下來依上述分工匯入遊戲程式與操作說明。"
        "組員持續以自己的帳號記錄工作，提交內容與分工對應。"
    ))
    body.append(section)

    rels = etree.fromstring(original["word/_rels/document.xml.rels"])
    package_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    for attrs in [
        {"Id": "rIdAOOPArchitecture", "Type": R + "/image", "Target": "media/aoop-architecture.png"},
        {"Id": "rIdAOOPRepository", "Type": R + "/hyperlink", "Target": "https://github.com/MoobyMoo/AOOP_Final_Project_Group_1/", "TargetMode": "External"},
    ]:
        etree.SubElement(rels, f"{{{package_ns}}}Relationship", **attrs)
    types = etree.fromstring(original["[Content_Types].xml"])
    ct_ns = "http://schemas.openxmlformats.org/package/2006/content-types"
    if not any(n.get("Extension") == "png" for n in types):
        etree.SubElement(types, f"{{{ct_ns}}}Default", Extension="png", ContentType="image/png")
    changed = {
        "word/document.xml": document,
        "word/_rels/document.xml.rels": rels,
        "[Content_Types].xml": types,
    }
    content = dict(original)
    for name, xml in changed.items():
        content[name] = etree.tostring(xml, xml_declaration=True, encoding="UTF-8", standalone=True)
    with ZipFile(OUTPUT, "w") as archive:
        for info in infos:
            archive.writestr(info, content[info.filename])
        archive.writestr("word/media/aoop-architecture.png", (ASSETS / "proposal-architecture.png").read_bytes())

    with ZipFile(OUTPUT) as final:
        for name, data in original.items():
            if name not in changed:
                assert final.read(name) == data, f"Preserve-only part changed: {name}"
        assert etree.tostring(etree.fromstring(final.read("word/document.xml")).find("w:body/w:sectPr", NS)) == etree.tostring(section)
        final_text = "".join(etree.fromstring(final.read("word/document.xml")).xpath(".//w:t/text()", namespaces=NS))
        for forbidden in ["簡述為什麼", "請附上", "請簡述", "務必注意", "1112511004"]:
            assert forbidden not in final_text, forbidden
        for required in ["112511002", "112511004", "112511017", "SFX", "介面與選單", "TypeScript", "EventBus"]:
            assert required in final_text, required
    report = {"reference_sha256": sha256(REFERENCE.read_bytes()).hexdigest(),
              "output_sha256": sha256(OUTPUT.read_bytes()).hexdigest(),
              "unchanged_parts": len(original) - len(changed),
              "changed_parts": list(changed), "added_parts": ["word/media/aoop-architecture.png"],
              "section_geometry_preserved": True, "slot_coverage": "pass", "placeholders_removed": True}
    (QA / "package-fidelity.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
