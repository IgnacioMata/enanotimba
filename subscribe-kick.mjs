const { KICK_CLIENT_ID, KICK_CLIENT_SECRET, KICK_CHANNEL_ID } = process.env;
if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET || !/^\d+$/.test(KICK_CHANNEL_ID ?? "")) {
  throw new Error("Configurá KICK_CLIENT_ID, KICK_CLIENT_SECRET y KICK_CHANNEL_ID.");
}

const login = await fetch("https://id.kick.com/oauth/token", {
  method: "POST",
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: KICK_CLIENT_ID,
    client_secret: KICK_CLIENT_SECRET
  })
});
if (!login.ok) throw new Error("Kick no entregó el token de aplicación. HTTP " + login.status);
const { access_token } = await login.json();
const endpoint = new URL("https://api.kick.com/public/v1/events/subscriptions");
const headers = { authorization: "Bearer " + access_token };
endpoint.searchParams.set("broadcaster_user_id", KICK_CHANNEL_ID);
const current = await fetch(endpoint, { headers });
if (!current.ok) throw new Error("No se pudieron consultar las suscripciones. HTTP " + current.status);
const { data } = await current.json();
if (data?.some(entry => entry.event === "chat.message.sent" && entry.version === 1)) {
  console.log("La suscripción al chat ya existe.");
} else {
  endpoint.search = "";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      broadcaster_user_id: Number(KICK_CHANNEL_ID),
      method: "webhook",
      events: [{ name: "chat.message.sent", version: 1 }]
    })
  });
  if (!response.ok) throw new Error("Kick rechazó la suscripción. HTTP " + response.status);
  const { data: created } = await response.json();
  if (!created?.some(entry => entry.subscription_id && !entry.error)) {
    throw new Error("Kick no confirmó la suscripción al chat.");
  }
  console.log("Suscripción creada. Verificá la recepción con un mensaje en Kick.");
}
