import { createHash, createHmac, createVerify, randomBytes, timingSafeEqual } from "node:crypto";
import pg from "pg";

const env = process.env;
const kickApi = "https://api.kick.com/public/v1";
const kickId = "https://id.kick.com/oauth";
const redirectUri = () => new URL("/api/kick/callback", env.URL).href;
const cookieNames = { oauth: "__Host-kick-oauth", session: "__Host-kick-session" };
let pool;
let publicKey;

function db(query, args = []) {
  pool ??= new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
  return pool.query(query, args);
}

function signedCookie(name, payload, seconds) {
  const value = payload
    ? Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + seconds * 1000 })).toString("base64url")
    : "";
  const signature = value && createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
  return `${name}=${value ? value + "." + signature : ""}; Max-Age=${seconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request, name) {
  const prefix = name + "=";
  const cookie = (request.headers.get("cookie") || "").split(/;\s*/).find(value => value.startsWith(prefix));
  if (!cookie) return null;
  const [value, signature] = cookie.slice(prefix.length).split(".");
  const expected = createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
  if (signature?.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function redirect(location, cookies = []) {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function beginLogin() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    client_id: env.KICK_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "user:read",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256"
  });
  return redirect(kickId + "/authorize?" + params, [signedCookie(cookieNames.oauth, { state, verifier }, 600)]);
}

async function finishLogin(request, params) {
  const oauth = readCookie(request, cookieNames.oauth);
  const clear = signedCookie(cookieNames.oauth, null, 0);
  const fail = () => redirect("/?kick=error#comunidad", [clear]);
  if (!oauth || params.get("state") !== oauth.state || !params.get("code")) return fail();
  const response = await fetch(kickId + "/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.KICK_CLIENT_ID,
      client_secret: env.KICK_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code: params.get("code"),
      code_verifier: oauth.verifier
    })
  });
  if (!response.ok) return fail();
  const { access_token } = await response.json();
  const profile = await fetch(kickApi + "/users", { headers: { authorization: "Bearer " + access_token } });
  if (!profile.ok) return fail();
  const user = (await profile.json()).data?.[0];
  if (!user?.user_id || !user.name) return fail();
  return redirect("/#comunidad", [
    clear,
    signedCookie(cookieNames.session, { id: String(user.user_id), name: user.name }, 8 * 3600)
  ]);
}

async function verifyWebhook(request, body) {
  const id = request.headers.get("Kick-Event-Message-Id");
  const time = request.headers.get("Kick-Event-Message-Timestamp");
  const signature = request.headers.get("Kick-Event-Signature");
  if (!id || !signature || !(Math.abs(Date.now() - Date.parse(time)) <= 15 * 60 * 1000)) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!publicKey || attempt) {
      const response = await fetch(kickApi + "/public-key");
      if (!response.ok) throw new Error("Kick public key unavailable");
      publicKey = (await response.json()).data.public_key;
    }
    if (createVerify("RSA-SHA256").update(id + "." + time + "." + body).verify(publicKey, signature, "base64")) return true;
  }
  return false;
}

async function webhook(request) {
  const body = await request.text();
  if (body.length > 64_000) return json({ error: "Evento demasiado grande." }, 413);
  if (!await verifyWebhook(request, body)) return json({ error: "Firma inválida." }, 401);
  if (request.headers.get("Kick-Event-Type") !== "chat.message.sent") return new Response(null, { status: 204 });
  const event = JSON.parse(body);
  if (String(event.broadcaster?.user_id) !== env.KICK_CHANNEL_ID) return new Response(null, { status: 204 });
  const date = new Date(event.created_at);
  if (!event.message_id || !event.sender?.user_id || !event.sender?.username || Number.isNaN(+date)) {
    return json({ error: "Evento incompleto." }, 400);
  }
  await db(
    "INSERT INTO kick_chat VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING",
    [event.message_id, String(event.sender.user_id), event.sender.username, date]
  );
  return new Response(null, { status: 204 });
}

async function snapshot(user) {
  const [ranking, blacklist, prizes] = await Promise.all([
    db(`SELECT (array_agg(username ORDER BY sent_at DESC))[1] AS username,
        count(*)::int AS messages, max(sent_at) >= now() - interval '15 minutes' AS active
      FROM kick_chat WHERE sent_at >= now() - interval '24 hours'
      GROUP BY user_id ORDER BY messages DESC, max(sent_at), user_id LIMIT 200`),
    db("SELECT username, reason FROM community_blacklist ORDER BY username"),
    user ? db("SELECT id, label, claimed_at FROM community_prizes WHERE user_id = $1 ORDER BY claimed_at DESC NULLS FIRST, label", [user.id]) : { rows: [] }
  ]);
  return json({ user, admin: user?.id === env.KICK_CHANNEL_ID, ranking: ranking.rows, blacklist: blacklist.rows, prizes: prizes.rows });
}

async function mutate(request, user) {
  if (request.headers.get("origin") !== new URL(env.URL).origin) return json({ error: "Origen inválido." }, 403);
  if (!user) return json({ error: "Ingresá con Kick." }, 401);
  const body = await request.json();
  if (body.action === "logout") {
    const response = json({ ok: true });
    response.headers.append("set-cookie", signedCookie(cookieNames.session, null, 0));
    return response;
  }
  if (body.action === "claim" && /^[a-f0-9-]{36}$/i.test(body.id ?? "")) {
    const result = await db(`UPDATE community_prizes SET claimed_at = now()
      WHERE id::text = $1 AND user_id = $2 AND claimed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM community_blacklist WHERE username = lower($3))`,
    [body.id, user.id, user.name]);
    return result.rowCount ? json({ ok: true }) : json({ error: "El tipeo no está disponible para reclamar." }, 409);
  }
  if (user.id !== env.KICK_CHANNEL_ID) return json({ error: "Solo el dueño del canal puede administrar." }, 403);
  const name = String(body.user ?? "").trim().toLowerCase();
  const label = String(body.label ?? "").trim();
  if (!/^[a-z0-9_-]{2,32}$/.test(name)) return json({ error: "Ingresá un usuario de Kick válido." }, 400);
  if (body.action === "unblock") {
    await db("DELETE FROM community_blacklist WHERE username = $1", [name]);
  } else if (body.action === "block" && label && label.length <= 120) {
    await db("INSERT INTO community_blacklist VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET reason = excluded.reason", [name, label]);
  } else if (body.action === "award" && label && label.length <= 100) {
    const result = await db(`INSERT INTO community_prizes(user_id, label)
      SELECT user_id, $2 FROM kick_chat WHERE lower(username) = $1 ORDER BY sent_at DESC LIMIT 1`, [name, label]);
    if (!result.rowCount) return json({ error: "Este usuario todavía no aparece en el chat registrado." }, 404);
  } else {
    return json({ error: "Revisá los datos ingresados." }, 400);
  }
  return json({ ok: true });
}

export default async function handler(request) {
  const url = new URL(request.url);
  if (!["URL", "DATABASE_URL", "KICK_CLIENT_ID", "KICK_CLIENT_SECRET", "KICK_CHANNEL_ID", "SESSION_SECRET"].every(key => env[key])) {
    return json({ error: "La conexión con Kick todavía no está configurada." }, 503);
  }
  try {
    if (request.method === "GET" && url.pathname === "/api/kick/login") return beginLogin();
    if (request.method === "GET" && url.pathname === "/api/kick/callback") return await finishLogin(request, url.searchParams);
    if (request.method === "POST" && url.pathname === "/api/kick/webhook") return await webhook(request);
    if (url.pathname === "/api/community") {
      const user = readCookie(request, cookieNames.session);
      if (request.method === "GET") return await snapshot(user);
      if (request.method === "POST") return await mutate(request, user);
    }
    return json({ error: "Ruta no disponible." }, 404);
  } catch (error) {
    console.error("Community request failed", error.code || error.name);
    return json({ error: "No se pudo completar la operación." }, 500);
  }
}

export const config = { path: ["/api/community", "/api/kick/login", "/api/kick/callback", "/api/kick/webhook"] };
