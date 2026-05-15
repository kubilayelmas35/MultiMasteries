from pathlib import Path
import re

p = Path(__file__).resolve().parent.parent / "docs" / "index.html"
t = p.read_text(encoding="utf-8")
t = t.replace("</motion>", "</div>").replace("<motion ", "<motion ")

stu_block = """      <motion id="stu-main" style="display:none;">
        <motion class="card">
          <motion class="muted" id="stu-welcome"></motion>
          <motion id="stu-progress"></motion>
        </motion>
        <motion class="card">
          <h2 style="font-size:1rem;margin:0 0 8px;">Bu haftanın programı (göreve tıklayın)</h2>
          <motion class="week-scroll" id="stu-week-grid"></motion>
        </motion>
      </motion>"""
stu_block = stu_block.replace("motion", "div")

m = re.search(r'<div id="stu-main"[\s\S]*?<!-- ÖĞRETMEN -->', t)
if not m:
    raise SystemExit("stu-main block not found")
t = t[: m.start()] + stu_block + "\n\n    <!-- ÖĞRETMEN -->" + t[m.end() :]

idx = t.find('<script src="app.js"></script>')
end = t.find("</script>", idx) + len("</script>")
t = t[:end] + "\n</body>\n</html>\n"

p.write_text(t, encoding="utf-8")
print("ok", len(t.splitlines()))
