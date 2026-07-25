/**
 * Smoke: HostGator signal.php relay (fallback firewall).
 * Uso: node tests/coop-relay-smoke.mjs
 */
const API = process.env.SIGNAL_URL || "https://jhonatanribeiro.com/snow/api/signal.php";

async function post(body) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("API", API);
  const ping = await post({ action: "ping" });
  assert(ping.ok && ping.roomsWritable, "ping/roomsWritable failed");

  const created = await post({ action: "create", seed: 99 });
  assert(created.code, "create sem code");
  const code = created.code;

  const joined = await post({ action: "join", code });
  assert(joined.code === code, "join code mismatch");

  await post({
    action: "publish",
    code,
    role: "host",
    relayMode: true,
  });

  const hostRelay = await post({
    action: "relay",
    code,
    role: "host",
    messages: [
      { t: "hello", role: "host", skin: "natan" },
      { t: "snap", deposited: 1, enemies: [], collected: [] },
    ],
  });
  assert(hostRelay.relayLastId >= 2, "host relayLastId");

  const guestPoll = await post({
    action: "poll",
    code,
    role: "guest",
    sinceRelay: 0,
    sinceHostIce: 0,
    sinceGuestIce: 0,
  });
  assert(guestPoll.relayMode === true, "relayMode não ligado");
  assert(guestPoll.relayMsgs?.length === 2, `guest esperava 2 msgs, veio ${guestPoll.relayMsgs?.length}`);
  assert(guestPoll.relayMsgs.every((e) => e.from === "host"), "guest viu from errado");

  const hostPollOwn = await post({
    action: "poll",
    code,
    role: "host",
    sinceRelay: 0,
    sinceHostIce: 0,
    sinceGuestIce: 0,
  });
  assert((hostPollOwn.relayMsgs || []).length === 0, "host não deve ver próprias msgs");

  await post({
    action: "relay",
    code,
    role: "guest",
    messages: [{ t: "pose", x: 3, y: 0, z: 4, yaw: 1 }],
  });

  const hostPoll2 = await post({
    action: "poll",
    code,
    role: "host",
    sinceRelay: 0,
    sinceHostIce: 0,
    sinceGuestIce: 0,
  });
  assert(hostPoll2.relayMsgs?.length === 1, "host deveria ver pose do guest");
  assert(hostPoll2.relayMsgs[0].m.t === "pose", "tipo pose");

  // Cursor: guest já leu até lastId — poll com since não reenvia
  const guestPoll2 = await post({
    action: "poll",
    code,
    role: "guest",
    sinceRelay: guestPoll.relayLastId,
    sinceHostIce: 0,
    sinceGuestIce: 0,
  });
  assert((guestPoll2.relayMsgs || []).length === 0, "cursor sinceRelay falhou");

  console.log("OK coop relay smoke", { code, relayLastId: hostPoll2.relayLastId });
}

main().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
