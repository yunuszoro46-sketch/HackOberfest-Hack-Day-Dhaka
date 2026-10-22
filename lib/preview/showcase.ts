// Shared pieces for the canned previews (mock provider and the example idea): a gradient hero with CSS animation,
// a small live script, and one React component written with htm. They show what a generated preview may contain.

export const SHOWCASE_STYLE = `<style>
  .tm-hero { background: radial-gradient(120% 140% at 0% 0%, #6366f1 0%, transparent 55%), radial-gradient(120% 140% at 100% 0%, #ec4899 0%, transparent 52%), linear-gradient(135deg, #0f172a, #1e1b4b); }
  .tm-glass { background: rgba(255,255,255,.14); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,.28); }
  .tm-cta { background: linear-gradient(90deg, #4f46e5, #8b5cf6, #ec4899); background-size: 200% 100%; transition: background-position .4s ease; }
  .tm-cta:hover { background-position: 100% 0; }
  @keyframes tm-live { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
  .tm-live { animation: tm-live 1.6s ease-in-out infinite; }
  @keyframes tm-rise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
  [data-screen]:not([hidden]) main > * { animation: tm-rise .35s ease both; }
</style>`;

/** "updated Ns ago" that ticks, for any element with data-ago. */
export const LIVE_SCRIPT = `<script>
  (function () {
    var s = 0;
    var els = [].slice.call(document.querySelectorAll("[data-ago]"));
    setInterval(function () { s += 5; els.forEach(function (e) { e.textContent = s + "s ago"; }); }, 5000);
  })();
</script>`;

/**
 * A filterable list as one React component (htm, no JSX). It renders into #tm-rooms, replacing the static list that
 * is shown when scripts are off.
 */
export function reactRoomsScript(rooms: { name: string; meta: string }[]): string {
  const data = JSON.stringify(rooms).replace(/</g, "\\u003c");
  return `<script>
  (function () {
    var html = htm.bind(React.createElement);
    var ROOMS = ${data};
    function Rooms() {
      var st = React.useState(""), q = st[0], setQ = st[1];
      var shown = ROOMS.filter(function (r) { return r.name.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      return html\`<div class="space-y-2">
        <input aria-label="Filter rooms" data-testid="room-filter" class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" placeholder="Filter rooms (React)" value=\${q} onInput=\${function (e) { setQ(e.target.value); }} />
        <ul class="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          \${shown.map(function (r) { return html\`<li key=\${r.name} class="flex items-center justify-between px-4 py-3"><span class="text-sm text-slate-900">\${r.name}</span><span class="text-xs text-slate-500">\${r.meta}</span></li>\`; })}
        </ul>
        <p class="text-xs text-slate-500">\${shown.length} of \${ROOMS.length} rooms</p>
      </div>\`;
    }
    var el = document.getElementById("tm-rooms");
    if (el) ReactDOM.createRoot(el).render(html\`<\${Rooms} />\`);
  })();
</script>`;
}

/** The static list React replaces; also what shows with scripts off. */
export const staticRooms = (rooms: { name: string; meta: string }[]) =>
  `<div id="tm-rooms"><ul class="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">${rooms
    .map((r) => `<li class="flex items-center justify-between px-4 py-3"><span class="text-sm text-slate-900">${r.name}</span><span class="text-xs text-slate-500">${r.meta}</span></li>`)
    .join("")}</ul></div>`;
