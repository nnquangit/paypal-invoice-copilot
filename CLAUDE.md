
<!-- docs-workflow -->
- **Tài liệu cho người đọc là HTML** (`docs/*.html`, cổng `docs/index.html`, CSS/JS chung `docs/assets/`, HTML + JS thuần, không framework): trang đọc nguồn `.md`/`.json` lúc mở, có sơ đồ/workflow (Archify → `docs/diagrams/`, nguồn `.archify/*/candidate.json`). Sửa nội dung = sửa nguồn; thêm trang = thêm vào `PAGES` trong `docs/assets/docs.js`; đổi kiến trúc → sinh lại sơ đồ. Tài liệu cho agent giữ markdown.

<!-- docs-workflow:workmap -->
- **Mọi việc đều lên bản đồ công việc** (`docs/workmap.html`, nguồn `docs/shared/workmap.json`): bắt đầu việc → `python3 scripts/workmap.py add "<Epic>/<Feature>" "<Việc>" -s doing`; xong → `python3 scripts/workmap.py set "<Epic>/<Feature>/<Việc>" done` (huỷ: `cancel`, tạm dừng: `pause`). Xem nhanh: `python3 scripts/workmap.py show -d 2`. Chưa cập nhật bản đồ = việc chưa xong.
