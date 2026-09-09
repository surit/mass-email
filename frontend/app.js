(() => {
  console.log('Workverse Mail v2.5 loaded');

  const cfg = window.WORKVERSE_MAIL_CONFIG || {};
  const API = '/api';
  let user = null;
  let cognitoUser = null;
  const csvNames = {};

  const $ = id => document.getElementById(id);

  const pool = () => new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: cfg.userPoolId,
    ClientId: cfg.clientId
  });

  /* ---------- UI helpers ---------- */
  function showApp() {
    const loginView = $('loginView');
    const appView = $('appView');
    if (loginView) loginView.hidden = true;
    if (appView) appView.hidden = false;
    const el = $('userEmail');
    if (el) el.textContent = user?.getUsername?.() || '';
  }

  function showLogin() {
    const loginView = $('loginView');
    const appView = $('appView');
    if (loginView) loginView.hidden = false;
    if (appView) appView.hidden = true;
  }

  function setStatus(el, msg, type = '') {
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status ' + type;
  }

  function resetLinkModal() {
    const linkModal = $('linkModal');
    const textEl = $('linkText');
    const textLabel = $('linkTextLabel');
    if (linkModal) linkModal.hidden = true;
    if (textEl) textEl.hidden = false;
    if (textLabel) textLabel.hidden = false;
  }

  /* ---------- Auth ---------- */
  function getSession() {
    try {
      const p = pool();
      cognitoUser = p.getCurrentUser();
      if (!cognitoUser) return;
      cognitoUser.getSession((err, session) => {
        if (!err && session?.isValid()) {
          user = cognitoUser;
          showApp();
        }
      });
    } catch (_) {}
  }

  const loginForm = $('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      const errEl = $('loginError');
      if (errEl) {
        errEl.textContent = '';
        errEl.className = 'error';
      }
      if (!cfg.userPoolId || cfg.userPoolId.startsWith('REPLACE')) {
        if (errEl) errEl.textContent = 'Cognito configuration is missing.';
        return;
      }
      const email = $('loginEmail').value.trim();
      const password = $('loginPassword').value;
      const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password });
      cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool() });
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: () => { user = cognitoUser; showApp(); },
        onFailure: err => {
          if (errEl) {
            errEl.textContent = err.message || 'Sign in failed.';
            errEl.className = 'error';
          }
        },
        newPasswordRequired: () => {
          loginForm.hidden = true;
          const npf = $('newPasswordForm');
          if (npf) npf.hidden = false;
        }
      });
    });
  }

  const newPasswordForm = $('newPasswordForm');
  if (newPasswordForm) {
    newPasswordForm.addEventListener('submit', e => {
      e.preventDefault();
      const errEl = $('newPasswordError');
      if (errEl) {
        errEl.textContent = '';
        errEl.className = 'error';
      }
      cognitoUser.completeNewPasswordChallenge($('newPassword').value, {}, {
        onSuccess: () => { user = cognitoUser; showApp(); },
        onFailure: err => {
          if (errEl) {
            errEl.textContent = err.message || 'Could not set password.';
            errEl.className = 'error';
          }
        }
      });
    });
  }

  const signOutBtn = $('signOut');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      if (cognitoUser) cognitoUser.signOut();
      user = null;
      cognitoUser = null;
      if (loginForm) loginForm.reset();
      if (newPasswordForm) {
        newPasswordForm.hidden = true;
        loginForm.hidden = false;
      }
      showLogin();
    });
  }

  /* ---------- Recipients ---------- */
  function recipientList() {
    const emails = [...new Set(($('recipients').value || '')
      .split(/[\s,;]+/)
      .map(x => x.trim().toLowerCase())
      .filter(Boolean))];
    return emails.map(email => ({ email, name: csvNames[email] || '' }));
  }

  function updateCount() {
    const list = recipientList();
    const el = $('recipientCount');
    if (el) el.textContent = `${list.length} recipient${list.length === 1 ? '' : 's'}`;
  }

  const recipientsEl = $('recipients');
  if (recipientsEl) recipientsEl.addEventListener('input', updateCount);

  /* ---------- CSV parser ---------- */
  function parseCSV(text) {
    text = (text || '').replace(/^\uFEFF/, '').replace(/^\uFFFE/, '');
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const first = lines[0];
    let sep = ',';
    if (first.includes('\t') && !first.includes(',')) sep = '\t';
    else if (first.includes(';') && !first.includes(',')) sep = ';';

    const splitLine = (line) => {
      const out = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else { inQ = !inQ; }
        } else if (ch === sep && !inQ) {
          out.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map(s => s.trim().replace(/^["']|["']$/g, ''));
    };

    const headers = splitLine(lines[0]).map(h => h.toLowerCase());
    const emailIdx = headers.indexOf('email');
    const nameIdx = headers.indexOf('name');
    if (emailIdx === -1) return [];

    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      if (cols[emailIdx]) {
        out.push({
          email: cols[emailIdx].toLowerCase(),
          name: nameIdx !== -1 ? (cols[nameIdx] || '') : ''
        });
      }
    }
    return out;
  }

  const csvFile = $('csvFile');
  if (csvFile) {
    csvFile.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        let text;
        if (file.text) {
          text = await file.text();
        } else {
          text = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(new Error('Read failed'));
            r.readAsText(file);
          });
        }
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
          const existing = [...new Set(($('recipients').value || '')
            .split(/[\s,;]+/)
            .map(x => x.trim().toLowerCase())
            .filter(Boolean))];
          if (recipientsEl) {
            recipientsEl.value = [...new Set([...existing, ...found.map(x => x.toLowerCase())])].join('\n');
          }
          const namesEl = $('csvNames');
          if (namesEl) namesEl.textContent = '';
          updateCount();
          alert('CSV header not recognized. Expected: Email,Name');
          return;
        }

        const existing = [...new Set(($('recipients').value || '')
          .split(/[\s,;]+/)
          .map(x => x.trim().toLowerCase())
          .filter(Boolean))];
        const newEmails = [];
        for (const row of parsed) {
          csvNames[row.email] = row.name;
          if (!existing.includes(row.email)) newEmails.push(row.email);
        }
        if (recipientsEl) {
          recipientsEl.value = [...existing, ...newEmails].join('\n');
        }
        updateCount();

        const tags = parsed.map(r => r.name ? `${r.name} (${r.email})` : r.email).join(', ');
        const namesEl = $('csvNames');
        if (namesEl) namesEl.textContent = `Loaded: ${tags}`;
        alert(`Loaded ${parsed.length} contacts:\n${parsed.map(r => `${r.name || '(no name)'} <${r.email}>`).join('\n')}`);
      } catch (err) {
        console.error(err);
        alert('CSV error: ' + err.message);
      }
      e.target.value = '';
    });
  }

  /* ---------- Editor toolbar ---------- */
  document.querySelectorAll('.editor-toolbar button[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val || null;
      document.execCommand(cmd, false, val);
      const body = $('body');
      if (body) body.focus();
    });
  });

  /* ---------- Link modal (text + image) ---------- */
  const linkBtn = $('linkBtn');
  const linkModal = $('linkModal');
  let savedRange = null;
  let isLinkingImage = false;

  if (linkBtn && linkModal) {
    linkBtn.addEventListener('click', () => {
      const sel = window.getSelection();
      savedRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

      // Detect if selection contains (or is on) an image
      isLinkingImage = false;
      if (savedRange) {
        const fragment = savedRange.cloneContents();
        if (fragment.querySelector('img')) {
          isLinkingImage = true;
        } else if (savedRange.collapsed) {
          const container = savedRange.startContainer;
          const offset = savedRange.startOffset;
          if (container.nodeType === 1 && container.childNodes[offset]?.nodeType === 1 && container.childNodes[offset].tagName === 'IMG') {
            isLinkingImage = true;
            savedRange.selectNode(container.childNodes[offset]);
          }
        }
      }

      const urlEl = $('linkUrl');
      const textEl = $('linkText');
      const textLabel = $('linkTextLabel');

      if (urlEl) urlEl.value = '';
      if (textEl) {
        textEl.value = sel.toString() || '';
        textEl.hidden = isLinkingImage;
      }
      if (textLabel) textLabel.hidden = isLinkingImage;

      linkModal.hidden = false;
      if (urlEl) urlEl.focus();
    });

    const cancelLink = $('cancelLink');
    if (cancelLink) {
      cancelLink.addEventListener('click', () => {
        savedRange = null;
        isLinkingImage = false;
        resetLinkModal();
      });
    }

    const confirmLink = $('confirmLink');
    if (confirmLink) {
      confirmLink.addEventListener('click', () => {
        const url = ($('linkUrl').value || '').trim();
        if (!url) {
          savedRange = null;
          isLinkingImage = false;
          resetLinkModal();
          return;
        }

        const body = $('body');
        if (body) body.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        if (savedRange) {
          sel.addRange(savedRange);
        } else if (body) {
          const range = document.createRange();
          range.selectNodeContents(body);
          range.collapse(false);
          sel.addRange(range);
        }

        const safeUrl = url.replace(/"/g, '&quot;').replace(/'/g, '&#039;');

        if (isLinkingImage) {
          const range = sel.getRangeAt(0);
          const a = document.createElement('a');
          a.href = safeUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';

          try {
            range.surroundContents(a);
          } catch (e) {
            const contents = range.extractContents();
            a.appendChild(contents);
            range.insertNode(a);
          }
        } else {
          const text = ($('linkText').value || '').trim();
          const safeText = escapeHtml(text || url);
          const html = `<a href="${safeUrl}">${safeText}</a>`;
          document.execCommand('insertHTML', false, html);
        }

        savedRange = null;
        isLinkingImage = false;
        resetLinkModal();
      });
    }

    linkModal.addEventListener('click', e => {
      if (e.target === linkModal) {
        savedRange = null;
        isLinkingImage = false;
        resetLinkModal();
      }
    });
  }

  /* ---------- Image handling ---------- */
  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        URL.revokeObjectURL(url);
        let width = img.width;
        let height = img.height;
        const maxDim = file.size > 6 * 1024 * 1024 ? 1200 : 1600;
        let quality = file.size > 6 * 1024 * 1024 ? 0.7 : 0.85;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
          } else {
            width = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const toBlob = (q) => new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
        let blob = await toBlob(quality);
        if (blob.size > 6 * 1024 * 1024) blob = await toBlob(0.6);
        if (blob.size > 6 * 1024 * 1024) blob = await toBlob(0.5);
        if (blob.size > 6 * 1024 * 1024) {
          const s = 0.7;
          width = Math.round(width * s);
          height = Math.round(height * s);
          canvas.width = width;
          canvas.height = height;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          blob = await toBlob(0.5);
        }
        resolve(blob);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  function readBlobAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function insertImage(src) {
    const img = document.createElement('img');
    img.src = src;
    img.style.maxWidth = '100%';
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.setEndAfter(img);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      const body = $('body');
      if (body) body.appendChild(img);
    }
    const body = $('body');
    if (body) body.focus();
  }

  const imageBtn = $('imageBtn');
  const imageUpload = $('imageUpload');
  if (imageBtn && imageUpload) {
    imageBtn.addEventListener('click', () => imageUpload.click());
    imageUpload.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const blob = await compressImage(file);
        const dataUrl = await readBlobAsDataURL(blob);
        insertImage(dataUrl);
      } catch (err) {
        alert('Could not process image: ' + err.message);
      }
      e.target.value = '';
    });
  }

  const bodyEl = $('body');
  if (bodyEl) {
    bodyEl.addEventListener('paste', async e => {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            try {
              const blob = await compressImage(item.getAsFile());
              const dataUrl = await readBlobAsDataURL(blob);
              insertImage(dataUrl);
            } catch (err) {
              alert('Could not paste image: ' + err.message);
            }
            return;
          }
        }
      }
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  /* ---------- Preview ---------- */
  const previewBtn = $('previewBtn');
  const previewModal = $('previewModal');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      const ps = $('previewSubject');
      const pb = $('previewBody');
      if (ps) ps.textContent = ($('subject').value || '').trim() || '(No subject)';
      if (pb) pb.innerHTML = (bodyEl?.innerHTML || '') || '<p>(Empty body)</p>';
      if (previewModal) previewModal.hidden = false;
    });
  }

  const closePreview = $('closePreview');
  if (closePreview && previewModal) {
    closePreview.addEventListener('click', () => { previewModal.hidden = true; });
    previewModal.addEventListener('click', e => { if (e.target === previewModal) previewModal.hidden = true; });
  }

  /* ---------- Global Escape key ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (linkModal) {
        savedRange = null;
        isLinkingImage = false;
        resetLinkModal();
      }
      if (previewModal) previewModal.hidden = true;
    }
  });

  /* ---------- API helper ---------- */
  async function api(path, options = {}) {
    return new Promise((resolve, reject) => {
      if (!cognitoUser) return reject(new Error('Not signed in'));
      cognitoUser.getSession(async (err, session) => {
        if (err || !session?.isValid()) {
          showLogin();
          return reject(new Error('Session expired'));
        }
        try {
          const res = await fetch(API + path, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              ...(options.headers || {}),
              'Authorization': session.getIdToken().getJwtToken()
            }
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /* ---------- Extract inline images ---------- */
  function extractAttachments(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || '', 'text/html');
    const imgs = doc.querySelectorAll('img');
    const attachments = [];
    let counter = 0;
    imgs.forEach(img => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('data:')) {
        const match = src.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          const cid = `img-${counter++}@workverse`;
          attachments.push({ cid, contentType: `image/${match[1]}`, data: match[2] });
          img.setAttribute('src', `cid:${cid}`);
        }
      }
    });
    return { html: doc.body.innerHTML, attachments };
  }

  /* ---------- Send ---------- */
  const sendBtn = $('sendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const list = recipientList();
      const subject = ($('subject').value || '').trim();
      const rawHtml = bodyEl ? bodyEl.innerHTML : '';
      const bodyText = bodyEl ? bodyEl.textContent : '';
      const statusEl = $('status');
      setStatus(statusEl, '');

      if (!list.length || list.length > 100 || !subject || !bodyText.trim()) {
        setStatus(statusEl, 'Enter 1-100 recipients, a subject and a body.', 'error');
        return;
      }

      const { html, attachments } = extractAttachments(rawHtml);
      console.log('Sending:', JSON.stringify(list, null, 2));

      if (!confirm(`Send this email to ${list.length} recipient${list.length === 1 ? '' : 's'}?`)) return;

      sendBtn.disabled = true;
      setStatus(statusEl, 'Sending...');
      try {
        const result = await api('/send', {
          method: 'POST',
          body: JSON.stringify({ recipients: list, subject, body: html, attachments })
        });
        setStatus(statusEl, `Done: ${result.successful} sent, ${result.failed?.length || 0} failed.`, 'success');
        await loadHistory();
      } catch (e) {
        setStatus(statusEl, e.message, 'error');
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  /* ---------- History ---------- */
  const refreshBtn = $('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadHistory);

  async function loadHistory() {
    const hist = $('history');
    if (hist) hist.innerHTML = '<div class="empty">Loading...</div>';
    try {
      const data = await api('/emails');
      const items = data.items || [];
      if (!items.length) {
        if (hist) hist.innerHTML = '<div class="empty">No emails sent yet.</div>';
        return;
      }
      if (hist) {
        hist.innerHTML = items.map(x => `
          <div class="history-item" data-id="${escapeHtml(x.campaignId || '')}">
            <div class="history-subject">${escapeHtml(x.subject || '')}<span class="badge ${escapeHtml((x.status || '').toLowerCase())}">${escapeHtml(x.status || '')}</span></div>
            <div class="history-meta">${new Date(x.sentAt).toLocaleString()} · ${x.successful ?? 0}/${x.recipientCount ?? 0} sent</div>
          </div>`).join('');
      }
    } catch (e) {
      if (hist) hist.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  getSession();
})();
