// LOOPS service worker: push notifications only ("Did you ride it?").
self.addEventListener("push", (event) => {
  let msg = { title: "LOOPS", body: "", url: "/" };
  try { msg = { ...msg, ...event.data.json() }; } catch { /* plain text */ }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: msg.tag, data: { url: msg.url },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(url));
});
