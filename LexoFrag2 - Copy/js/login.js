/* login.html — skip the form when a session already exists. */
(async () => {
  await initData({ withSession: true });
  if (currentUser) window.location.replace("dashboard.html");
})();
