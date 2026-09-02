(() => {
  const cfg = window.WORKVERSE_MAIL_CONFIG || {};
  const API = "/api";
  let user = null;
  let cognitoUser = null;

  const $ = id => document.getElementById(id);
  const pool = () => new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: cfg.userPoolId,
    ClientId: cfg.clientId
  });

  function showApp() {
    $("loginView").hidden = true;
    $("appView").hidden = false;
    $("userEmail").textContent = user?.getUsername?.() || "";
    loadHistory();
  }

  function showLogin() {
    $("loginView").hidden = false;
    $("appView").hidden = true;
  }

  function getSession() {
    try {
      const p = pool();
      cognitoUser = p.getCurrentUser();
      if (!cognitoUser) return;
      cognitoUser.getSession((err, session) => {
        if (!err && session.isValid()) {
          user = cognitoUser;
          showApp();
        }
      });
    } catch (_) {}
  }

  $("loginForm").addEventListener("submit", e => {
    e.preventDefault();
    $("loginError").textContent = "";
    if (!cfg.userPoolId || cfg.userPoolId.startsWith("REPLACE")) {
      $("loginError").textContent = "Cognito configuration is missing.";
      return;
    }
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const authenticationData = { Username: email, Password: password };
    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);
    cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: pool() });
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: result => { user = cognitoUser; showApp(); },
      onFailure: err => { $("loginError").textContent = err.message || "Sign in failed."; },
      newPasswordRequired: () => {
        $("loginForm").hidden = true;
        $("newPasswordForm").hidden = false;
      }
    });
  });

  $("newPasswordForm").addEventListener("submit", e => {
    e.preventDefault();
    $("newPasswordError").textContent = "";
    cognitoUser.completeNewPasswordChallenge($("newPassword").value, {}, {
      onSuccess: () => { user = cognitoUser; showApp(); },
      onFailure: err => { $("newPasswordError").textContent = err.message || "Could not set password."; }
    });
  });

  $("signOut").addEventListener("click", () => {
    if (cognitoUser) cognitoUser.signOut();
    user = null;
    cognitoUser = null;
    $("loginForm").reset();
    $("newPasswordForm").hidden = true;
    $("loginForm").hidden = false;
    showLogin();
  });

  function recipients() {
    return [...new Set($("recipients").value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
  }

  function updateCount() {
    $("recipientCount").textContent = `${recipients().length} recipient${recipients().length === 1 ? "" : "s"}`;
  }

  $("recipients").addEventListener("input", updateCount);

  $("csvFile").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
    $("recipients").value = [...new Set([...recipients(), ...found.map(x => x.toLowerCase())])].join("\n");
    updateCount();
  });

  // Rich-text toolbar
  document.querySelectorAll(".editor-toolbar button[data-cmd]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val || null;
      if (cmd === "createLink") {
        const url = prompt("Enter URL:");
        if (url) document.execCommand(cmd, false, url);
      } else {
        document.execCommand(cmd, false, val);
      }
      $("body").focus();
    });
  });

  // Image compression
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

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const toBlob = (q) => new Promise(res => canvas.toBlob(res, "image/jpeg", q));

        let blob = await toBlob(quality);
        if (blob.size > 6 * 1024 * 1024) blob = await toBlob(0.6);
        if (blob.size > 6 * 1024 * 1024) blob = await toBlob(0.5);
        if (blob.size > 6 * 1024 * 1024) {
          const scale = 0.7;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          canvas.width = width;
          canvas.height = height;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          blob = await toBlob(0.5);
        }
        resolve(blob);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
  }

  function readBlobAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function insertImage(src) {
    const img = document.createElement("img");
    img.src = src;
    img.style.maxWidth = "100%";
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
      $("body").appendChild(img);
    }
    $("body").focus();
  }

  // Image button
  $("imageBtn").addEventListener("click", () => $("imageUpload").click());

  $("imageUpload").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const blob = await compressImage(file);
      const dataUrl = await readBlobAsDataURL(blob);
      insertImage(dataUrl);
    } catch (err) {
      alert("Could not process image: " + err.message);
    }
    e.target.value = "";
  });

  // Paste handler
  $("body").addEventListener("paste", async e => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          try {
            const blob = await compressImage(item.getAsFile());
            const dataUrl = await readBlobAsDataURL(blob);
            insertImage(dataUrl);
          } catch (err) {
            alert("Could not paste image: " + err.message);
          }
          return;
        }
      }
    }
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  // Preview
  $("previewBtn").addEventListener("click", () => {
    $("previewSubject").textContent = $("subject").value || "(No subject)";
    $("previewBody").innerHTML = $("body").innerHTML || "<p>(Empty body)</p>";
    $("previewModal").hidden = false;
  });
  $("closePreview").addEventListener("click", () => $("previewModal").hidden = true);
  $("previewModal").addEventListener("click", e => { if (e.target === $("previewModal")) $("previewModal").hidden = true; });

  async function api(path, options = {}) {
    return new Promise((resolve, reject) => {
      if (!cognitoUser) return reject(new Error("Not signed in"));
      cognitoUser.getSession(async (err, session) => {
        if (err || !session?.isValid()) {
          showLogin();
          return reject(new Error("Session expired"));
        }
        try {
          const res = await fetch(API + path, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              ...(options.headers || {}),
              "Authorization": session.getIdToken().getJwtToken()
            }
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
          resolve(data);
        } catch (e) { reject(e); }
      });
    });
  }

  // Extract base64 images and build attachments array
  function extractAttachments(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const imgs = doc.querySelectorAll("img");
    const attachments = [];
    let counter = 0;

    imgs.forEach(img => {
      const src = img.getAttribute("src");
      if (src && src.startsWith("data:")) {
        const match = src.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          const cid = `img-${counter++}@workverse`;
          attachments.push({
            cid,
            contentType: `image/${match[1]}`,
            data: match[2]
          });
          img.setAttribute("src", `cid:${cid}`);
        }
      }
    });

    return {
      html: doc.body.innerHTML,
      attachments
    };
  }

  $("sendBtn").addEventListener("click", async () => {
    const list = recipients();
    const subject = $("subject").value.trim();
    const rawHtml = $("body").innerHTML;
    const bodyText = $("body").textContent || "";
    $("status").textContent = "";

    if (!list.length || list.length > 100 || !subject || !bodyText.trim()) {
      $("status").textContent = "Enter 1-100 recipients, a subject and a body.";
      return;
    }

    const { html, attachments } = extractAttachments(rawHtml);

    if (!confirm(`Send this email to ${list.length} recipient${list.length === 1 ? "" : "s"}?`)) return;

    $("sendBtn").disabled = true;
    $("status").textContent = "Sending...";

    try {
      const result = await api("/send", {
        method: "POST",
        body: JSON.stringify({ recipients: list, subject, body: html, attachments })
      });
      $("status").textContent = `Done: ${result.successful} sent, ${result.failed?.length || 0} failed.`;
      await loadHistory();
    } catch (e) {
      $("status").textContent = e.message;
    } finally {
      $("sendBtn").disabled = false;
    }
  });

  async function loadHistory() {
    $("history").innerHTML = '<div class="empty">Loading...</div>';
    try {
      const data = await api("/emails");
      const items = data.items || [];
      if (!items.length) {
        $("history").innerHTML = '<div class="empty">No emails sent yet.</div>';
        return;
      }
      $("history").innerHTML = items.map(x => `
        <div class="history-item">
          <div class="history-subject">${escapeHtml(x.subject || "")}
            <span class="badge">${escapeHtml(x.status || "")}</span>
          </div>
          <div class="history-meta">${new Date(x.sentAt).toLocaleString()} · ${x.successful ?? 0}/${x.recipientCount ?? 0} sent</div>
        </div>`).join("");
    } catch (e) {
      $("history").innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  $("refreshBtn").addEventListener("click", loadHistory);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  getSession();
})();
