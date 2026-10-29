// OWNER: Person 2 — STRETCH: real Google Calendar API via chrome.identity.
// Setup: Google Cloud project -> enable Calendar API -> OAuth client (Chrome extension, your extension ID)
// -> add "oauth2": { "client_id": "...", "scopes": ["https://www.googleapis.com/auth/calendar.readonly"] } to manifest.json.
// Until then, the ICS secret-address route in calendar.js is the real integration.
export async function connectGoogle() {
  const token = await chrome.identity.getAuthToken({ interactive: true });
  return !!(token?.token || token);
}

export async function getGoogleEvents(dateISO) {
  const t = await chrome.identity.getAuthToken({ interactive: false });
  const token = t?.token || t;
  const timeMin = new Date(`${dateISO}T00:00:00`).toISOString();
  const timeMax = new Date(`${dateISO}T23:59:59`).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${timeMin}&timeMax=${timeMax}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}`);
  const data = await res.json();
  const local = (s) => { const d = new Date(s); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; };
  return (data.items || [])
    .filter((e) => e.start?.dateTime && e.transparency !== "transparent")
    .map((e) => ({ start: local(e.start.dateTime), end: local(e.end.dateTime), title: e.summary || "Busy" }));
}
