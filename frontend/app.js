
const cfg = window.WORKVERSE_MAIL_CONFIG || {};

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const newPasswordForm = document.getElementById("newPasswordForm");
const loginMessage = document.getElementById("loginMessage");
const appMessage = document.getElementById("appMessage");

let authSession = null;
let pendingChallenge = null;

function setMessage(element, text, ok = false) {
  element.textContent = text || "";
  element.style.color = ok ? "#26734d" : "#a23a3a";
}

function tokenKey() {
  return `workverse_mail_${cfg.userPoolId}_tokens`;
}

function saveTokens(result) {
  localStorage.setItem(tokenKey(), JSON.stringify(result));
}

function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(tokenKey()) || "null");
  } catch {
    return null;
  }
}

function clearTokens() {
  localStorage.removeItem(tokenKey());
}

async function cognito(target, payload) {
  const response = await fetch(
    `https://cognito-idp.${cfg.region}.amazonaws.com/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.__type || "Authentication failed");
  }

  return data;
}

async function signIn(email, password) {
  return cognito("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: cfg.clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  });
}

async function completeNewPassword(email, newPassword, session) {
  return cognito("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: cfg.clientId,
    Session: session,
    ChallengeResponses: {
      USERNAME: email,
      NEW_PASSWORD: newPassword
    }
  });
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  loadHistory();
}

function showLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
}

function authenticated() {
  return !!(authSession && authSession.AccessToken);
}

function getAccessToken() {
  return authSession?.AccessToken || "";
}

async function api(path, options = {}) {
  if (!authenticated()) {
    throw new Error("Please sign in.");
  }

  const headers = {
    Authorization: `Bearer ${getAccessToken()}`,
    ...(options.headers || {})
  };

  const response = await fetch(path, {
    ...options,
    headers
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (response.status === 401 || response.status === 403) {
    clearTokens();
    authSession = null;
    showLogin();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "Signing in...", true);

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const result = await signIn(email, password);

    if (result.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      pendingChallenge = { email, session: result.Session };
      loginForm.classList.add("hidden");
      newPasswordForm.classList.remove("hidden");
      setMessage(loginMessage, "Set your new password.", true);
      return;
    }

    authSession = result.AuthenticationResult;
    saveTokens(authSession);
    showApp();
  } catch (error) {
    setMessage(loginMessage, error.message);
  }
});

newPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "Updating password...", true);

  const newPassword = document.getElementById("newPassword").value;

  try {
    const result = await completeNewPassword(
      pendingChallenge.email,
      newPassword,
      pendingChallenge.session
    );

    authSession = result.AuthenticationResult;
    saveTokens(authSession);
    pendingChallenge = null;
    newPasswordForm.classList.add("hidden");
    loginForm.reset();
    loginForm.classList.remove("hidden");
    showApp();
  } catch (error) {
    setMessage(loginMessage, error.message);
  }
});

document.getElementById("signOutBtn").addEventListener("click", () => {
  clearTokens();
  authSession = null;
  showLogin();
});

const recipientsEl = document.getElementById("recipients");
const recipientCountEl = document.getElementById("recipientCount");

function parseRecipients(text) {
  return [...new Set(
    text
      .split(/[\s,;]+/)
      .map(x => x.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function updateRecipientCount() {
  const recipients = parseRecipients(recipientsEl.value);
  recipientCountEl.textContent =
    `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`;
}

recipientsEl.addEventListener("input", updateRecipientCount);

document.getElementById("clearRecipientsBtn").addEventListener("click", () => {
  recipientsEl.value = "";
  document.getElementById("csvFile").value = "";
  updateRecipientCount();
});

document.getElementById("csvFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();

  const emails = parseRecipients(
    text.replace(/["']/g, " ")
  );

  recipientsEl.value = emails.join(", ");
  updateRecipientCount();

  setMessage(
    appMessage,
    `${emails.length} email address${emails.length === 1 ? "" : "es"} loaded.`,
    true
  );
});

document.getElementById("previewBtn").addEventListener("click", () => {
  const recipients = parseRecipients(recipientsEl.value);
  const subject = document.getElementById("subject").value.trim();
  const body = document.getElementById("body").value;

  if (!recipients.length || !subject || !body.trim()) {
    setMessage(appMessage, "Enter recipients, subject and body first.");
    return;
  }

  document.getElementById("previewTo").textContent =
    recipients.length <= 3
      ? recipients.join(", ")
      : `${recipients.slice(0, 3).join(", ")} + ${recipients.length - 3} more`;

  document.getElementById("previewSubject").textContent = subject;
  document.getElementById("previewBody").textContent = body;
  document.getElementById("previewModal").classList.remove("hidden");
});

document.getElementById("closePreviewBtn").addEventListener("click", () => {
  document.getElementById("previewModal").classList.add("hidden");
});

document.getElementById("sendBtn").addEventListener("click", async () => {
  const recipients = parseRecipients(recipientsEl.value);
  const subject = document.getElementById("subject").value.trim();
  const body = document.getElementById("body").value;

  if (!recipients.length || !subject || !body.trim()) {
    setMessage(appMessage, "Enter recipients, subject and body first.");
    return;
  }

  if (recipients.length > 100) {
    setMessage(appMessage, "Maximum 100 recipients per send.");
    return;
  }

  const confirmed = window.confirm(
    `Send "${subject}" to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}?`
  );

  if (!confirmed) return;

  const button = document.getElementById("sendBtn");
  button.disabled = true;
  button.textContent = "Sending...";
  setMessage(appMessage, "Sending...", true);

  try {
    const result = await api("/api/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipients,
        subject,
        body
      })
    });

    const failed = result.failed?.length || 0;

    setMessage(
      appMessage,
      `Completed: ${result.successful} sent${failed ? `, ${failed} failed` : ""}.`,
      failed === 0
    );

    if (failed === 0) {
      recipientsEl.value = "";
      document.getElementById("subject").value = "";
      document.getElementById("body").value = "";
      document.getElementById("csvFile").value = "";
      updateRecipientCount();
    }

    await loadHistory();
  } catch (error) {
    setMessage(appMessage, error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Send email";
  }
});

async function loadHistory() {
  const history = document.getElementById("history");
  history.innerHTML = '<div class="muted">Loading...</div>';

  try {
    const data = await api("/api/emails");
    const items = data.items || [];

    if (!items.length) {
      history.innerHTML = '<div class="muted">No sent emails yet.</div>';
      return;
    }

    history.innerHTML = items.map(item => `
      <div class="history-item" data-id="${escapeHtml(item.campaignId)}">
        <div class="history-subject">${escapeHtml(item.subject)}</div>
        <div class="history-meta">
          ${escapeHtml(formatDate(item.sentAt))}
          · ${Number(item.recipientCount || 0)} recipients
          · ${escapeHtml(item.status || "")}
        </div>
      </div>
    `).join("");

    history.querySelectorAll(".history-item").forEach(item => {
      item.addEventListener("click", () => loadCampaign(item.dataset.id));
    });
  } catch (error) {
    history.innerHTML = `<div class="message">${escapeHtml(error.message)}</div>`;
  }
}

async function loadCampaign(id) {
  try {
    const data = await api(`/api/emails/${encodeURIComponent(id)}`);
    const campaign = data.campaign;
    const recipients = data.recipients || [];

    const lines = recipients.map(
      r => `${r.email} — ${r.status}`
    ).join("\n");

    document.getElementById("previewTo").textContent = lines || "No recipient records";
    document.getElementById("previewSubject").textContent = campaign.subject;
    document.getElementById("previewBody").textContent = campaign.body;
    document.getElementById("previewModal").classList.remove("hidden");
  } catch (error) {
    setMessage(appMessage, error.message);
  }
}

document.getElementById("refreshBtn").addEventListener("click", loadHistory);

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value || "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

(function init() {
  if (
    !cfg.region ||
    !cfg.userPoolId ||
    !cfg.clientId ||
    cfg.userPoolId.startsWith("REPLACE")
  ) {
    setMessage(
      loginMessage,
      "Cognito configuration is missing. Update frontend/config.js after deployment."
    );
    return;
  }

  authSession = loadTokens();

  if (authenticated()) {
    showApp();
  } else {
    showLogin();
  }
})();
