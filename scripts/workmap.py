#!/usr/bin/env python3
"""Bản đồ công việc (docs-workflow): Epic → Feature → Task → Subtask, có trạng thái.

Nguồn: docs/shared/workmap.json (cấu trúc) + docs/tasks/T-*.md nếu có (tiêu đề, trạng thái task).
Trang: docs/workmap.html — dữ liệu nhúng thẳng vào trang, mở file:// trực tiếp vẫn chạy.

  python3 scripts/workmap.py                       sinh lại docs/workmap.html
  python3 scripts/workmap.py show [đường-dẫn] [-d N]  in dàn ý + trạng thái (đọc nhanh, ít token)
  python3 scripts/workmap.py add  "<Epic>/<Feature>" "<Tên>" [-s doing] [-t T-012] [-n "ghi chú"]
        thêm nút con; đoạn đường dẫn chưa có sẽ tự tạo. "-t T-012" = nút gắn task (lấy tên/trạng thái từ docs/tasks)
  python3 scripts/workmap.py set  "<Epic>/<Feature>/<Tên>" <pending|doing|pause|cancel|done|auto> [-n "ghi chú"]
        đổi trạng thái ("auto" = bỏ trạng thái ghi tay, tính từ nút con)

Đường dẫn: tên nút nối bằng "/", không phân biệt hoa thường; khớp đúng tên trước, rồi tới tiền tố/chuỗi con
nếu chỉ có 1 nút khớp; nút task khớp theo mã (vd "T-012"). add/set tự sinh lại trang.
"""
import argparse, datetime, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs/shared/workmap.json")
OUT = os.path.join(ROOT, "docs/workmap.html")
TPL = os.path.join(ROOT, "scripts/workmap.template.html")
STATUSES = ["pending", "doing", "pause", "cancel", "done"]
TASK_STATUS = {"todo": "pending", "doing": "doing", "blocked": "pause", "done": "done", "cancel": "cancel"}
LEVELS = ["root", "epic", "feature", "task", "subtask"]
TITLE_MAX = 64
ICON = {"pending": "○", "doing": "▶", "pause": "‖", "cancel": "✕", "done": "✓"}


def load_tasks():
    out = {}
    for f in glob.glob(os.path.join(ROOT, "docs/tasks/T-*.md")):
        txt = open(f, encoding="utf-8").read()
        m = re.match(r"# (T-\d+)\s+(.*)", txt)
        st = re.search(r"^Trạng thái:\s*(\S+)", txt, re.M)
        if m:
            out[m.group(1)] = {"title": m.group(2).strip(), "status": TASK_STATUS.get(st.group(1) if st else "todo", "pending")}
    return out


def aggregate(sts):
    live = [s for s in sts if s != "cancel"]
    if not live:
        return "cancel"
    if "doing" in live:
        return "doing"
    if all(s == "done" for s in live):
        return "done"
    if "pause" in live:
        return "pause"
    return "doing" if "done" in live else "pending"


def resolve(node, tasks, depth):
    """Nút trong json → nút hiển thị: điền tên/trạng thái task, tính trạng thái cha từ con."""
    n = {"level": node.get("level") or LEVELS[min(depth, 4)], "name": node.get("name", "")}
    for k in ("note", "at"):
        if k in node:
            n[k] = node[k]
    if "task" in node:
        t = tasks.get(node["task"], {"title": node.get("name") or "(không tìm thấy task)", "status": "pending"})
        title = t["title"] if len(t["title"]) <= TITLE_MAX else t["title"][: TITLE_MAX - 1] + "…"
        n.update(level=node.get("level", "task"), name=f'{node["task"]} · {title}', status=t["status"], ref=node["task"])
    kids = [resolve(c, tasks, depth + 1) for c in node.get("children", [])]
    if kids:
        n["children"] = kids
    if "status" in node:
        n["status"] = node["status"]
    elif "status" not in n:
        n["status"] = aggregate([k["status"] for k in kids]) if kids else "pending"
    return n


def load():
    if not os.path.exists(SRC):
        sys.exit(f"chưa có {os.path.relpath(SRC, ROOT)} — chạy init.sh của docs-workflow hoặc tạo file {{\"title\": \"...\", \"children\": []}}")
    return json.load(open(SRC, encoding="utf-8"))


def save(data):
    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def tree(data):
    return resolve({"level": "root", "name": data.get("title", "Dự án"), "children": data.get("children", [])}, load_tasks(), 0)


def render(data):
    t = tree(data)
    tpl = open(TPL, encoding="utf-8").read()
    payload = json.dumps(t, ensure_ascii=False).replace("</", "<\\/")
    title = data.get("title", "Dự án").replace("&", "&amp;").replace("<", "&lt;")
    html = tpl.replace("/*__WORKMAP_DATA__*/null", payload).replace("__WORKMAP_TITLE__", title)
    open(OUT, "w", encoding="utf-8").write(html)
    print(f"đã ghi {os.path.relpath(OUT, ROOT)}")


def label(node, tasks):
    if "task" in node:
        t = tasks.get(node["task"])
        return f'{node["task"]} · {t["title"]}' if t else node["task"]
    return node.get("name", "")


def find(data, path, create=False):
    """Đi theo đường dẫn "A/B/C" → (nút json, độ sâu). create=True: tạo đoạn chưa có."""
    tasks = load_tasks()
    node, depth = data, 0
    for part in [p.strip() for p in path.split("/") if p.strip()]:
        kids = node.setdefault("children", []) if create else node.get("children", [])
        q = part.lower()
        exact = [k for k in kids if label(k, tasks).lower() == q or k.get("name", "").lower() == q or k.get("task", "").lower() == q]
        hits = exact or [k for k in kids if q in label(k, tasks).lower()]
        if len(hits) > 1:
            sys.exit(f'"{part}" khớp nhiều nút: ' + ", ".join(label(k, tasks) for k in hits))
        if hits:
            node = hits[0]
        elif create:
            node = {"level": LEVELS[min(depth + 1, 4)], "name": part}
            kids.append(node)
            print(f"  tạo nhánh: {part}")
        else:
            sys.exit(f'không thấy "{part}" trong "{path}" — xem: python3 scripts/workmap.py show')
        depth += 1
    return node, depth


def cmd_show(data, path, max_depth):
    if path:
        node, depth = find(data, path)
        t = resolve(node, load_tasks(), depth)
    else:
        t = tree(data)

    def walk(n, d):
        if d > max_depth:
            return
        tag = "" if n["level"] in ("root", "task", "subtask") else f' [{n["level"]}]'
        print("  " * d + f'{ICON[n["status"]]} {n["name"]}{tag}' + (f'  — {n["note"]}' if n.get("note") else ""))
        for k in n.get("children", []):
            walk(k, d + 1)
    walk(t, 0)


def main():
    ap = argparse.ArgumentParser(description="Bản đồ công việc docs-workflow", add_help=True)
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("show"); s.add_argument("path", nargs="?", default=""); s.add_argument("-d", "--depth", type=int, default=9)
    a = sub.add_parser("add"); a.add_argument("parent"); a.add_argument("name"); a.add_argument("-s", "--status", choices=STATUSES)
    a.add_argument("-t", "--task"); a.add_argument("-n", "--note")
    e = sub.add_parser("set"); e.add_argument("path"); e.add_argument("status", choices=STATUSES + ["auto"]); e.add_argument("-n", "--note")
    args = ap.parse_args()
    data = load()
    today = datetime.date.today().isoformat()
    if args.cmd == "show":
        return cmd_show(data, args.path, args.depth)
    if args.cmd == "add":
        parent, depth = find(data, args.parent, create=True)
        node = {"task": args.task} if args.task else {"level": LEVELS[min(depth + 1, 4)], "name": args.name}
        if args.task and args.name:
            node["name"] = args.name
        if args.status:
            node["status"] = args.status
        if args.note:
            node["note"] = args.note
        node["at"] = today
        parent.setdefault("children", []).append(node)
        print(f'  thêm: {args.parent} / {args.task or args.name}' + (f" ({args.status})" if args.status else ""))
    elif args.cmd == "set":
        node, _ = find(data, args.path)
        if args.status == "auto":
            node.pop("status", None)
        else:
            node["status"] = args.status
        if args.note:
            node["note"] = args.note
        node["at"] = today
        print(f"  {args.path} → {args.status}")
    if args.cmd in ("add", "set"):
        save(data)
    render(data)


if __name__ == "__main__":
    main()
