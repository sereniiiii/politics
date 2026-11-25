#!/usr/bin/env python3
"""把 data/meta.json + data/b*.json + data/x*.json 合并成 data/content.js，并做结构校验。

用法：python3 tools/build_content.py
输出：data/content.js（window.ZZ，供 index.html / detail.html 直接以 <script> 引入）
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)

meta = load("meta.json")
books = meta["books"]

lesson_map = {}
for b in books:
    order = 0
    for les in b["lessons"]:
        order += 1
        unit = None
        for u in b.get("units", []):
            if les["id"] in u["lessons"]:
                unit = u
                break
        lesson_map[les["id"]] = {
            "bookId": b["id"], "bookName": b["name"], "bookTitle": b["title"],
            "unitNo": (unit or {}).get("no", ""), "unitTitle": (unit or {}).get("title", ""),
            "lessonNo": les["no"], "lessonTitle": les["title"], "order": order,
        }

items = []
for name in ["b1.json", "b2.json", "b3.json", "b4.json", "x1.json", "x2.json", "x3.json"]:
    items += load(name)["items"]

# ---- 本课脉络（总览卡 + 详情面板数据） ----
import re
lesson_maps = {}
if os.path.exists(os.path.join(DATA, "lessons.json")):
    lm = load("lessons.json")["lessons"]
    for x in lm:
        if x["lesson"] in lesson_maps:
            errs_lm = "重复课次：" + x["lesson"]
            print(errs_lm); sys.exit(1)
        lesson_maps[x["lesson"]] = x

# 校验
errs = []
seen = set()
for it in items:
    for k in ("id", "lesson", "title", "summary", "type", "diff", "core"):
        if k not in it:
            errs.append(f"{it.get('id','?')} 缺少字段 {k}")
    if it["id"] in seen:
        errs.append(f"重复 id：{it['id']}")
    seen.add(it["id"])
    if it["lesson"] not in lesson_map:
        errs.append(f"{it['id']} 的 lesson 不存在：{it['lesson']}")
    if not isinstance(it["core"], list) or not it["core"]:
        errs.append(f"{it['id']} core 必须是非空数组")
    if it["diff"] not in (1, 2, 3):
        errs.append(f"{it['id']} diff 非法：{it['diff']}")
    if it["type"] not in ("总览", "概念", "原理", "制度", "对比", "易错", "答题"):
        errs.append(f"{it['id']} type 非法：{it['type']}")
    if len(it["summary"]) > 90:
        errs.append(f"{it['id']} 摘要过长（{len(it['summary'])} 字）")

lesson_counts = {}
for it in items:
    lesson_counts[it["lesson"]] = lesson_counts.get(it["lesson"], 0) + 1
for les in lesson_map:
    if les not in lesson_counts:
        errs.append(f"课次没有考点：{les}")

# 本课脉络校验与生成
if lesson_maps:
    for les in lesson_map:
        if les not in lesson_maps:
            errs.append(f"本课脉络缺失：{les}")
    for k, x in lesson_maps.items():
        if k not in lesson_map:
            errs.append(f"本课脉络课次不存在：{k}")
        for f in ("gist", "chain", "must", "traps", "asks"):
            if not x.get(f):
                errs.append(f"{k} 本课脉络缺少 {f}")
        if len(x.get("gist", "")) > 90:
            errs.append(f"{k} 本课脉络摘要过长")
        if len(x.get("chain", [])) < 3:
            errs.append(f"{k} 本课脉络主线少于 3 步")

if errs:
    print("校验失败：")
    for e in errs:
        print(" -", e)
    sys.exit(1)

if lesson_maps:
    for les, x in lesson_maps.items():
        m = lesson_map[les]
        theme = re.sub(r"^第[一二三四五六七八九十]+课\s*", "", m["lessonTitle"])
        items.append({
            "id": les + "-0",
            "lesson": les,
            "title": "本课脉络 · " + theme,
            "summary": x["gist"],
            "type": "总览",
            "diff": 1,
            "core": [
                "主线：" + " → ".join(x["chain"]),
                "必背：" + "；".join(x["must"]),
                "易错：" + "；".join(x["traps"]),
                "常问：" + "；".join(x["asks"]),
            ],
            "pitfall": "本卡只管本课的骨架；具体论证与材料分析，点开同课的考点卡。",
            "exam": "先用主线复述本课逻辑，再用必背术语作答，最后按易错清单自查。",
            "terms": x["must"][:4],
        })
    items.sort(key=lambda z: z["id"])

out = []
for it in items:
    m = lesson_map[it["lesson"]]
    rec = {
        "id": it["id"],
        "title": it["title"],
        "summary": it["summary"],
        "type": it["type"],
        "diff": it["diff"],
        "core": it["core"],
        "pitfall": it.get("pitfall", ""),
        "exam": it.get("exam", ""),
        "terms": it.get("terms", []),
        "lesson": it["lesson"],
        "bookId": m["bookId"], "bookName": m["bookName"], "bookTitle": m["bookTitle"],
        "unitNo": m["unitNo"], "unitTitle": m["unitTitle"],
        "lessonNo": m["lessonNo"], "lessonTitle": m["lessonTitle"],
        "order": m["order"],
    }
    out.append(rec)

payload = {
    "meta": {
        "title": meta["meta"]["title"],
        "updated": datetime.date.today().isoformat(),
        "note": meta["meta"]["note"],
        "count": len(out),
    },
    "books": books,
    "items": out,
}

js = "/* 自动生成，请勿手改；改 data/*.json 后运行 tools/build_content.py */\n"
js += "window.ZZ = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
with open(os.path.join(DATA, "content.js"), "w", encoding="utf-8") as f:
    f.write(js)

print(f"OK：{len(out)} 条考点，{len(lesson_map)} 课，{len(books)} 本书")
print(f"content.js 体积：{os.path.getsize(os.path.join(DATA,'content.js'))/1024:.0f} KB")

# ---- 视图数据：主体矩阵 + 易混对照 ----
mx_path = os.path.join(DATA, "matrix.json")
pairs_path = os.path.join(DATA, "pairs.json")
views = {}
if os.path.exists(mx_path):
    mx = load("matrix.json")
    dims = mx["dims"]
    keys = [d["key"] for d in dims]
    bad = []
    for sub in mx["subjects"]:
        if not sub.get("id") or not sub.get("name"):
            bad.append("矩阵主体缺少 id 或 name")
        if set(sub.get("dims", {})) != set(keys):
            bad.append(f"{sub.get('id')} 的维度与 dims 不一致")
        for k in keys:
            if not sub["dims"].get(k):
                bad.append(f"{sub['id']}.{k} 为空")
        if sub.get("anchorLesson") and sub["anchorLesson"] not in lesson_map:
            bad.append(f"{sub['id']} 的教材落点课次不存在")
    if bad:
        print("矩阵校验失败：")
        for b in bad:
            print(" -", b)
        sys.exit(1)
    views["matrix"] = mx
if os.path.exists(pairs_path):
    pr = load("pairs.json")
    bad = []
    for x in pr["pairs"]:
        for k in ("id", "title", "a", "b", "diff", "pitfall", "memo"):
            if k not in x:
                bad.append(f"{x.get('id','?')} 缺少 {k}")
        if not isinstance(x.get("diff"), list) or len(x["diff"]) < 2:
            bad.append(f"{x.get('id','?')} 的区别要点少于 2 条")
        for side in ("a", "b"):
            if not x[side].get("label") or not x[side].get("text"):
                bad.append(f"{x.get('id','?')}.{side} 缺少 label 或 text")
    if bad:
        print("对照校验失败：")
        for b in bad:
            print(" -", b)
        sys.exit(1)
    views["pairs"] = pr
if lesson_maps:
    views["lessons"] = [{
        "lesson": k,
        "gist": x["gist"], "chain": x["chain"], "must": x["must"],
        "traps": x["traps"], "asks": x["asks"],
    } for k, x in lesson_maps.items()]

if views:
    vjs = "/* 自动生成，请勿手改；改 data/matrix.json / data/pairs.json 后运行 tools/build_content.py */\n"
    vjs += "window.ZZViews = " + json.dumps(views, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(DATA, "views.js"), "w", encoding="utf-8") as f:
        f.write(vjs)
    print(f"views.js：{len(views.get('matrix',{}).get('subjects',[]))} 个主体 · {len(views.get('pairs',{}).get('pairs',[]))} 组对照 · {len(views.get('lessons',[]))} 课脉络 · {os.path.getsize(os.path.join(DATA,'views.js'))/1024:.1f} KB")
print("每课条数：")
for b in books:
    row = " ".join(f"{les['id']}:{lesson_counts[les['id']]}" for les in b["lessons"])
    print(f"  {b['name']} {b['title']}  {row}")
