from pathlib import Path

p = Path(__file__).resolve().parent.parent / "docs" / "app.js"
t = p.read_text(encoding="utf-8")
start = t.index("    const maxSlot = Math.max")
end = t.index("    html += '</tr></tbody></table>';", start) + len("    html += '</tr></tbody></table>';")
new = """    for (const day of DAYS) {
      const dayItems = STU_WEEK_ITEMS.filter((x) => x.dayOfWeek === day.dow)
        .sort((a, b) => Number(a.slotOrder) - Number(b.slotOrder));
      const isToday = day.dow === todayDow;
      html += '<td class="day-col" style="vertical-align:top"><div class="day-col-inner">';
      if (!dayItems.length) html += '<div class="stu-cell empty">—</div>';
      dayItems.forEach((it) => {
        if (!it.subject) return;
        const col = (it.subject && it.subject.color) || '#64748b';
        const done = it.log && it.log.kanbanStatus === 'done';
        html += '<button type="button" class="stu-cell-btn' + (isToday ? ' today-ring' : '') + (done ? ' done' : '') + '" data-id="' + it._id + '" style="background:' + col + '33;border-left:4px solid ' + col + ';width:100%;margin-bottom:6px;text-align:left;cursor:pointer">';
        html += '<div class="t">' + escapeHtml(it.subject.title) + '</div>';
        if (it.topicSnapshot) html += '<div class="k">' + escapeHtml(it.topicSnapshot) + '</div>';
        html += '<motion class="d">' + formatDuration(it.durationMinutes) + (done ? ' · ✓' : '') + '</div>';
        html += '</button>';
      });
      html += '</div></td>';
    }
    html += '</tr></tbody></table>';"""
new = new.replace('<motion class="d">', '<div class="d">')
t = t[:start] + new + t[end:]
p.write_text(t, encoding="utf-8")
print("patched")
