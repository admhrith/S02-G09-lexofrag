/* =============================================================================
   LexoFrag — authentication
   login.html  : handleLogin / quickLogin
   Ops pages   : requireLogin() guard + handleLogout()
   ============================================================================= */

async function loginWithCredentials(email, pass) {
  await ensureBackendChecked(); // never fall back to offline login while the backend check is still running
  const errBox = document.getElementById("login-error");
  const showError = (msg) => { errBox.textContent = msg; errBox.classList.remove("hidden"); };
  const badLogin = "Invalid email or password. Use saif@lexofrag.my / lexo123 or click a Quick Demo Login card below.";
  let user = null;

  if (apiOnline) {
    try {
      user = (await api("login", { email, password: pass })).user;
      currentUser = { email: user.email, name: user.name, role: user.role };
      await syncFromServer();
    } catch (e) {
      return showError(e.message === "Invalid email or password." ? badLogin : e.message);
    }
  } else {
    const account = DEMO_USERS[email.trim().toLowerCase()];
    if (!account || account.pass !== pass) return showError(badLogin);
    currentUser = { email: email.trim().toLowerCase(), name: account.name, role: account.role };
  }

  errBox.classList.add("hidden");
  sessionStorage.setItem("lexofrag_user", JSON.stringify(currentUser));
  window.location.href = "dashboard.html";
}

function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("login-email").value;
  const pass = document.getElementById("login-password").value;
  loginWithCredentials(email, pass);
}

function quickLogin(email, pass) {
  document.getElementById("login-email").value = email;
  document.getElementById("login-password").value = pass;
  loginWithCredentials(email, pass);
}

async function handleLogout() {
  // Release the camera if the Stock Audit page has it open.
  if (typeof isScanning !== "undefined" && isScanning) await toggleCamera();
  if (apiOnline) { try { await api("logout"); } catch (e) {} }
  currentUser = null;
  sessionStorage.removeItem("lexofrag_user");
  window.location.href = "index.html";
}

/* Guard for dashboard.html / orders.html. Loads data, then either reveals the
   page or sends the visitor to login.html. */
async function requireLogin() {
  await initData({ withSession: true });
  if (!currentUser) {
    window.location.replace("login.html");
    return false;
  }
  document.documentElement.classList.remove("auth-pending");
  return true;
}
