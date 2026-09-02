const $ = (id) => document.getElementById(id);
let selectedCampaign = null;

function parseEmails(value) {
  return [...new Set(value.split(/[\s,;]+/).map(v => v.trim().toLowerCase()).filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showStatus(message, error = false) {
  $('status').textContent = message;
  $('status').style.color = error ? '#b42318' : '#16734a';
}

async function loadHistory() {
  try {
    const r = await fetch('/api/emails');
    if (!r.ok) throw new Error('Could not load sent emails');
    const data = await r.json();
    const el = $('sentList');
    if (!data.items?.length) {
      el.innerHTML = '<div class="empty">No emails sent yet.</div>';
      return;
    }
    el.innerHTML = data.items.map(x => `
      <button class="item" data-id="${escapeHtml(x.campaignId)}">
        <b>${escapeHtml(x.subject || '(No subject)')}</b>
        <div class="to">${x.recipientCount} recipient${x.recipientCount === 1 ? '' : 's'}</div>
        <div class="date">${escapeHtml(new Date(x.sentAt).toLocaleString())}</div>
      </button>`).join('');
    document.querySelectorAll('.item').forEach(btn => btn.onclick = () => openCampaign(btn.dataset.id));
  } catch (e) {
    $('sentList').innerHTML = '<div class="empty">Unable to load sent emails.</div>';
  }
}

async function openCampaign(id) {
  try {
    const r = await fetch('/api/emails/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('Not found');
    const x = await r.json();
    selectedCampaign = x;
    $('detailSubject').textContent = x.subject || '(No subject)';
    $('detailDate').textContent = new Date(x.sentAt).toLocaleString();
    $('detailRecipients').textContent = x.recipients.join(', ');
    $('detailBody').textContent = x.body || '';
    $('detailModal').classList.add('show');
  } catch (e) {
    alert('Could not load email details.');
  }
}

function prepare() {
  const recipients = parseEmails($('recipients').value);
  if (!recipients.length) return alert('Please add at least one valid email address.');
  if (recipients.length > 100) return alert('Please send to 100 recipients or fewer at a time in this basic version.');
  if (!$('subject').value.trim()) return alert('Please enter a subject.');
  if (!$('body').value.trim()) return alert('Please enter the email body.');
  $('pSubject').textContent = $('subject').value.trim();
  $('pTo').textContent = `${recipients.length} recipient${recipients.length === 1 ? '' : 's'}: ${recipients.join(', ')}`;
  $('pBody').textContent = $('body').value;
  return recipients;
}

$('csv').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const values = [];
    for (const line of lines) {
      const first = line.split(',')[0].trim().replace(/^"|"$/g, '');
      if (first.toLowerCase() !== 'email') values.push(first);
    }
    $('recipients').value = [...new Set([...parseEmails($('recipients').value), ...parseEmails(values.join('\n'))])].join(', ');
    showStatus(`Loaded ${parseEmails(values.join('\n')).length} email address(es) from CSV.`);
  };
  reader.readAsText(f);
};

$('addEmail').onclick = () => $('recipients').focus();
$('preview').onclick = () => { if (prepare()) $('modal').classList.add('show'); };
$('close').onclick = () => $('modal').classList.remove('show');
$('detailClose').onclick = () => $('detailModal').classList.remove('show');
$('sentNav').onclick = () => $('sentList').scrollIntoView({behavior:'smooth'});
$('viewAll').onclick = () => loadHistory();

$('send').onclick = () => sendEmail();
$('confirmSend').onclick = () => { $('modal').classList.remove('show'); sendEmail(); };

async function sendEmail() {
  const recipients = prepare();
  if (!recipients) return;
  if (!confirm(`Send this email to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}?`)) return;
  $('send').disabled = true;
  $('confirmSend').disabled = true;
  showStatus('Sending...');
  try {
    const r = await fetch('/api/send', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ recipients, subject: $('subject').value.trim(), body: $('body').value })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Send failed');
    showStatus(`Sent successfully to ${data.recipientCount} recipient(s).`);
    $('recipients').value = '';
    $('subject').value = '';
    $('body').value = '';
    $('csv').value = '';
    await loadHistory();
  } catch (e) {
    showStatus(e.message || 'Send failed.', true);
  } finally {
    $('send').disabled = false;
    $('confirmSend').disabled = false;
  }
}

loadHistory();
