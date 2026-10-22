// The SQL block is derived from the data model by code, so it always matches the tables shown.
import type { Entity } from "../schema/ideaCard";

const SQL_TYPES: Record<string, string> = {
  uuid: "uuid", id: "uuid", text: "text", string: "text", varchar: "text", int: "integer", integer: "integer", number: "numeric",
  float: "double precision", double: "double precision", decimal: "numeric", bool: "boolean", boolean: "boolean",
  timestamp: "timestamptz", datetime: "timestamptz", date: "date", time: "time", json: "jsonb", jsonb: "jsonb",
};

const ident = (s: string) => {
  const snake = s.trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return /^[a-z_][a-z0-9_]*$/.test(snake) ? snake : `"${s.replace(/"/g, "")}"`;
};

const sqlType = (t: string) => SQL_TYPES[t.trim().toLowerCase().replace(/\(.*\)$/, "")] ?? "text";

/** Parses "Booking.roomId -> Room.id" relations into foreign keys. */
function foreignKeys(e: Entity, all: Entity[]): string[] {
  const out: string[] = [];
  for (const r of e.relations) {
    const m = /^\s*(\w+)\.(\w+)\s*-+>\s*(\w+)\.(\w+)/.exec(r);
    if (!m || m[1].toLowerCase() !== e.name.toLowerCase()) continue;
    if (!all.some((x) => x.name.toLowerCase() === m[3].toLowerCase())) continue;
    out.push(`  foreign key (${ident(m[2])}) references ${ident(m[3])} (${ident(m[4])})`);
  }
  return out;
}

export function toSql(entities: Entity[]): string {
  return entities
    .map((e) => {
      const cols = e.fields.map((f, i) => {
        const pk = i === 0 && /^id$/i.test(f.name) ? " primary key" : "";
        const comment = f.note ? ` -- ${f.note.replace(/\n/g, " ")}` : "";
        return { line: `  ${ident(f.name)} ${sqlType(f.type)}${pk}`, comment };
      });
      const fks = foreignKeys(e, entities).map((line) => ({ line, comment: "" }));
      const rows = [...cols, ...fks];
      const body = rows.map((r, i) => `${r.line}${i < rows.length - 1 ? "," : ""}${r.comment}`).join("\n");
      return `create table ${ident(e.name)} (\n${body}\n);`;
    })
    .join("\n\n");
}
