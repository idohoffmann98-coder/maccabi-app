// עמוד הניהול: עדכון פציעות, רענון נתונים ושליחת התראת ניסיון
const $ = (id) => document.getElementById(id);
    try { $('token').value = localStorage.getItem('adminToken') || ''; } catch {}
    const call = async (path, body) => {
      const r = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-admin-token': $('token').value }, body: body && JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      return j;
    };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const drawList = (inj) => {
      $('list').innerHTML = inj.length ? inj.map((i) => `<div class="abs"><div style="flex:1"><b>${esc(i.playerName)}</b><div class="inj">${esc(i.injury)}${i.expectedReturn ? ' · ' + esc(i.expectedReturn) : ''}</div></div><button class="btn" data-c="${esc(i.playerCode)}">הסרה (חזר לשחק)</button></div>`).join('') : '<div class="empty">אין פציעות מסומנות</div>';
      $('list').querySelectorAll('button').forEach((b) => (b.onclick = async () => drawList((await call('injuries', { playerCode: b.dataset.c, remove: true })).injuries)));
    };
    $('load').onclick = async () => {
      try {
        const d = await call('roster');
        try { localStorage.setItem('adminToken', $('token').value); } catch {}
        $('player').innerHTML = d.roster.map((p) => `<option value="${esc(p.code)}">${esc(p.nameHe)} (#${esc(p.dorsal)})</option>`).join('');
        drawList(d.injuries);
        $('msg').textContent = '✅ מחובר';
      } catch (e) { $('msg').textContent = 'שגיאה: ' + e.message; }
    };
    $('save').onclick = async () => {
      try {
        const d = await call('injuries', { playerCode: $('player').value, injury: $('injury').value, expectedReturn: $('ret').value, note: $('note').value });
        drawList(d.injuries);
        $('msg').textContent = '✅ נשמר. התצוגה המקדימה של המשחק הבא עודכנה.';
        $('injury').value = $('ret').value = $('note').value = '';
      } catch (e) { $('msg').textContent = 'שגיאה: ' + e.message; }
    };
    $('refresh').onclick = async () => { $('msg').textContent = 'מעדכן…'; try { const d = await call('refresh', {}); $('msg').textContent = '✅ עודכן: ' + new Date(d.updatedAt).toLocaleString('he-IL'); } catch (e) { $('msg').textContent = 'שגיאה: ' + e.message; } };
    $('test').onclick = async () => { try { const d = await call('test-push', {}); $('msg').textContent = `✅ נשלח ל-${d.sent} מכשירים`; } catch (e) { $('msg').textContent = 'שגיאה: ' + e.message; } };
