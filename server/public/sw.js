// Drinky service worker: shows reminders pushed by the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : { title: "Take a sip 💧", body: "" };
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: "drinky", // a new reminder replaces the old one
      renotify: true,
      icon: "/icon.png",
      badge: "/icon.png",
      actions: [
        { action: "drink", title: "Done ✓" },
        { action: "snooze", title: "Snooze 5 min" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action) {
    e.waitUntil(fetch(`/api/${e.action}`, { method: "POST" }));
    return;
  }
  e.waitUntil(
    self.clients
      .matchAll({ type: "window" })
      .then((list) =>
        list[0] ? list[0].focus() : self.clients.openWindow("/"),
      ),
  );
});
