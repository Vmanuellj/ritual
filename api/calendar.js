// Calendario para suscribirse desde Google Calendar o Apple Calendar.
// Cada persona tiene un link secreto (?t=...) que devuelve sus citas y trabajos asignados en formato .ics.
const SUPA_URL = "https://tefxfxbdylunaeajtcak.supabase.co";
const SUPA_KEY = "sb_publishable_3CERy3XxHXUWnqyhXnqB4Q_y8IvLrS1"; // llave pública

const pad = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Las líneas del formato .ics no deben pasar de 75 bytes.
const fold = (line) => {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
};
const ymd = (d) => d.replace(/-/g, "");
const stamp = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`; };

function vevent({ id, date, time, dur, title, location, details }) {
  const lines = ["BEGIN:VEVENT", `UID:${id}@ritual`, `DTSTAMP:${stamp(Date.now())}Z`];
  const [y, m, d] = date.split("-").map(Number);
  if (time) {
    const [h, mi] = time.split(":").map(Number);
    const start = Date.UTC(y, m - 1, d, h, mi);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(start + (dur || 60) * 60000)}`);
  } else {
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    lines.push(`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`);
  }
  lines.push(`SUMMARY:${esc(title)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (details) lines.push(`DESCRIPTION:${esc(details)}`);
  lines.push("END:VEVENT");
  return lines.map(fold).join("\r\n");
}

export default async function handler(req, res) {
  const tok = String(req.query.t || "").replace(/[^a-f0-9]/gi, "");
  if (!tok) return res.status(400).send("Falta el link del calendario.");

  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/ritual_calendar`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tok }),
  });
  const data = r.ok ? await r.json() : null;
  if (!data) return res.status(404).send("Este link de calendario no existe o ya no es válido.");

  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const events = [];
  const own = data.own || {};
  const byId = (list, id) => (list || []).find((x) => x.id === id) || {};
  for (const a of own.appts || []) {
    if (!a.date || a.date < since || a.status === "cancelada") continue;
    const svc = byId(own.services, a.serviceId), proj = byId(own.projects, a.projectId), cl = byId(own.clients, a.clientId);
    const name = proj.name || svc.name || a.title || "Cita";
    const client = cl.name || a.client || "";
    events.push(vevent({
      id: a.id, date: a.date, time: a.time, dur: svc.duration,
      title: client ? `${name} · ${client}` : name,
      location: a.address,
      details: [client && `Cliente: ${client}`, cl.phone && `Tel: ${cl.phone}`, a.assignee && `Asignada a: ${a.assignee}`, a.note].filter(Boolean).join("\n"),
    }));
  }
  for (const group of data.jobs || []) {
    for (const j of group.jobs || []) {
      if (!j.date || j.date < since || j.status === "cancelada") continue;
      events.push(vevent({
        id: `job-${j.id}`, date: j.date, time: j.time, dur: j.dur,
        title: `${j.title}${j.client ? " · " + j.client : ""}`,
        location: j.address,
        details: [group.biz && `Negocio: ${group.biz}`, j.client && `Cliente: ${j.client}`, j.phone && `Tel: ${j.phone}`, j.notes].filter(Boolean).join("\n"),
      }));
    }
  }

  const name = typeof own.name === "string" && own.name ? own.name : "ritual.";
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ritual.//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(name)} · ritual.`), "X-PUBLISHED-TTL:PT1H", "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...events, "END:VCALENDAR"].join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="ritual.ics"');
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).send(ics);
}
