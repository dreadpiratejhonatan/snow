<?php
/**
 * Signaling WebRTC para co-op 2P + relay HTTPS de fallback.
 * Ações JSON: ping | create | join | publish | poll | relay
 * Rooms: data/rooms/{CODE}.json (TTL 30 min)
 *
 * relay: quando NAT/firewall bloqueia WebRTC, o jogo sincroniza
 * via HTTPS (mesma API) — passa em redes que só liberam 443.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$dataDir = dirname(__DIR__) . '/data';
$roomsDir = $dataDir . '/rooms';
$ttlSec = 1800; // 30 min
$iceCap = 200;
$relayCap = 60;
$relayBatchMax = 24;
$relayMsgMaxBytes = 14000;

if (!is_dir($dataDir)) mkdir($dataDir, 0755, true);
if (!is_dir($roomsDir)) mkdir($roomsDir, 0755, true);

function cleanup_rooms($roomsDir, $ttlSec) {
  $now = time();
  foreach (glob($roomsDir . '/*.json') ?: [] as $f) {
    if ($now - filemtime($f) > $ttlSec) @unlink($f);
  }
}

function room_path($roomsDir, $code) {
  $code = strtoupper(preg_replace('/[^A-Z0-9]/', '', $code));
  if (strlen($code) < 4 || strlen($code) > 8) return null;
  return $roomsDir . '/' . $code . '.json';
}

function read_room($path) {
  if (!$path || !file_exists($path)) return null;
  $fp = fopen($path, 'c+');
  if (!$fp) return null;
  flock($fp, LOCK_SH);
  $raw = stream_get_contents($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  $data = json_decode($raw ?: '', true);
  return is_array($data) ? $data : null;
}

function write_room($path, $data) {
  $fp = fopen($path, 'c+');
  if (!$fp) return false;
  flock($fp, LOCK_EX);
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  @touch($path);
  return true;
}

/**
 * Read-modify-write atômico (LOCK_EX durante todo o callback).
 * $fn(&$room) → payload de sucesso, ou ['__error' => [code, msg]].
 */
function mutate_room($path, $fn) {
  if (!$path || !file_exists($path)) return ['__error' => [404, 'Sala não encontrada']];
  $fp = fopen($path, 'c+');
  if (!$fp) return ['__error' => [500, 'Falha ao abrir sala']];
  flock($fp, LOCK_EX);
  $raw = stream_get_contents($fp);
  $room = json_decode($raw ?: '', true);
  if (!is_array($room)) {
    flock($fp, LOCK_UN);
    fclose($fp);
    return ['__error' => [500, 'Sala corrompida']];
  }
  $out = $fn($room);
  if (is_array($out) && isset($out['__error'])) {
    flock($fp, LOCK_UN);
    fclose($fp);
    return $out;
  }
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($room, JSON_UNESCAPED_UNICODE));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  @touch($path);
  return $out;
}

function make_code($roomsDir) {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for ($t = 0; $t < 20; $t++) {
    $code = '';
    for ($i = 0; $i < 6; $i++) {
      $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    if (!file_exists($roomsDir . '/' . $code . '.json')) return $code;
  }
  return null;
}

/** Entradas ICE: [{id, cand}, ...] — id monotônico. */
function append_ice(&$list, $incoming, &$nextId, $cap) {
  if (!is_array($incoming)) return;
  if (!is_array($list)) $list = [];
  if ($nextId < 1) $nextId = 1;
  foreach ($incoming as $cand) {
    if (!$cand) continue;
    // já no formato {id,cand}?
    if (is_array($cand) && isset($cand['cand'])) {
      $list[] = ['id' => $nextId++, 'cand' => $cand['cand']];
    } else {
      $list[] = ['id' => $nextId++, 'cand' => $cand];
    }
  }
  if (count($list) > $cap) {
    $list = array_values(array_slice($list, -$cap));
  }
}

function ice_since($list, $sinceId) {
  $out = [];
  $last = (int)$sinceId;
  foreach ($list ?: [] as $i => $entry) {
    if (is_array($entry) && isset($entry['id'], $entry['cand'])) {
      $id = (int)$entry['id'];
      if ($id > $sinceId) {
        $out[] = $entry['cand'];
        if ($id > $last) $last = $id;
      }
    } else {
      // legado: índice 0-based → id = index+1
      $id = $i + 1;
      if ($id > $sinceId) {
        $out[] = $entry;
        if ($id > $last) $last = $id;
      }
    }
  }
  return [$out, $last];
}

function last_ice_id($list) {
  $last = 0;
  foreach ($list ?: [] as $i => $entry) {
    if (is_array($entry) && isset($entry['id'])) {
      $id = (int)$entry['id'];
      if ($id > $last) $last = $id;
    } else {
      $id = $i + 1;
      if ($id > $last) $last = $id;
    }
  }
  return $last;
}

function last_relay_id($list) {
  $last = 0;
  foreach ($list ?: [] as $entry) {
    if (is_array($entry) && isset($entry['id'])) {
      $id = (int)$entry['id'];
      if ($id > $last) $last = $id;
    }
  }
  return $last;
}

/** Mensagens relay com id > since; opcionalmente exclui from === $exceptRole. */
function relay_since($list, $sinceId, $exceptRole = '') {
  $out = [];
  $last = (int)$sinceId;
  foreach ($list ?: [] as $entry) {
    if (!is_array($entry) || !isset($entry['id'], $entry['m'])) continue;
    $id = (int)$entry['id'];
    if ($id <= $sinceId) continue;
    $from = (string)($entry['from'] ?? '');
    if ($exceptRole !== '' && $from === $exceptRole) {
      if ($id > $last) $last = $id;
      continue;
    }
    $out[] = ['id' => $id, 'from' => $from, 'm' => $entry['m']];
    if ($id > $last) $last = $id;
  }
  return [$out, $last];
}

cleanup_rooms($roomsDir, $ttlSec);

$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) $body = [];
}
$action = $body['action'] ?? ($_GET['action'] ?? '');

if ($action === 'ping') {
  echo json_encode([
    'ok' => true,
    'ping' => true,
    'time' => time(),
    'roomsWritable' => is_writable($roomsDir),
  ]);
  exit;
}

if ($action === 'create') {
  $code = make_code($roomsDir);
  if (!$code) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível criar sala']);
    exit;
  }
  $seed = isset($body['seed']) ? (int)$body['seed'] : random_int(1, 2147483646);
  $room = [
    'code' => $code,
    'seed' => $seed,
    'createdAt' => time(),
    'hostReady' => false,
    'guestJoined' => false,
    'offer' => null,
    'answer' => null,
    'hostIce' => [],
    'guestIce' => [],
    'hostIceNextId' => 1,
    'guestIceNextId' => 1,
    'relayMode' => false,
    'relay' => [],
    'relayNextId' => 1,
    'needsHostRestart' => false,
  ];
  if (!write_room($roomsDir . '/' . $code . '.json', $room)) {
    http_response_code(500);
    echo json_encode(['error' => 'Falha ao gravar sala — verifique permissões de data/rooms/']);
    exit;
  }
  echo json_encode(['ok' => true, 'code' => $code, 'seed' => $seed, 'role' => 'host']);
  exit;
}

if ($action === 'join') {
  $path = room_path($roomsDir, $body['code'] ?? '');
  if (!$path || !file_exists($path)) {
    http_response_code(404);
    echo json_encode(['error' => 'Sala não encontrada ou expirou']);
    exit;
  }
  $out = mutate_room($path, function (&$room) {
    // Rejoin / replace guest: limpa handshake e pede restart do host
    if (!empty($room['guestJoined'])) {
      $room['guestIce'] = [];
      $room['guestIceNextId'] = 1;
      $room['answer'] = null;
      $room['relay'] = [];
      $room['relayNextId'] = 1;
      $room['relayMode'] = false;
      $room['needsHostRestart'] = true;
      // Novo offer do host após restart — limpa ICE antigo do host
      $room['hostIce'] = [];
      $room['hostIceNextId'] = 1;
    }
    $room['guestJoined'] = true;
    return [
      'ok' => true,
      'code' => $room['code'],
      'seed' => $room['seed'],
      'role' => 'guest',
    ];
  });
  if (isset($out['__error'])) {
    http_response_code($out['__error'][0]);
    echo json_encode(['error' => $out['__error'][1]]);
    exit;
  }
  echo json_encode($out);
  exit;
}

if ($action === 'publish') {
  $path = room_path($roomsDir, $body['code'] ?? '');
  $role = $body['role'] ?? '';
  $iceCapLocal = $iceCap;
  $out = mutate_room($path, function (&$room) use ($body, $role, $iceCapLocal) {
    if ($role === 'host') {
      if (isset($body['offer'])) {
        $room['offer'] = $body['offer'];
        $room['needsHostRestart'] = false;
      }
      if (isset($body['ice']) && is_array($body['ice'])) {
        $next = (int)($room['hostIceNextId'] ?? 1);
        append_ice($room['hostIce'], $body['ice'], $next, $iceCapLocal);
        $room['hostIceNextId'] = $next;
      }
      $room['hostReady'] = true;
    } elseif ($role === 'guest') {
      if (isset($body['answer'])) $room['answer'] = $body['answer'];
      if (isset($body['ice']) && is_array($body['ice'])) {
        $next = (int)($room['guestIceNextId'] ?? 1);
        append_ice($room['guestIce'], $body['ice'], $next, $iceCapLocal);
        $room['guestIceNextId'] = $next;
      }
    } else {
      return ['__error' => [400, 'role inválido']];
    }
    if (!empty($body['relayMode'])) {
      $room['relayMode'] = true;
    }
    return ['ok' => true];
  });
  if (isset($out['__error'])) {
    http_response_code($out['__error'][0]);
    echo json_encode(['error' => $out['__error'][1]]);
    exit;
  }
  echo json_encode($out);
  exit;
}

if ($action === 'relay') {
  $path = room_path($roomsDir, $body['code'] ?? '');
  $role = $body['role'] ?? '';
  $relayCapL = $relayCap;
  $relayBatchMaxL = $relayBatchMax;
  $relayMsgMaxBytesL = $relayMsgMaxBytes;
  $out = mutate_room($path, function (&$room) use ($body, $role, $relayCapL, $relayBatchMaxL, $relayMsgMaxBytesL) {
    if ($role !== 'host' && $role !== 'guest') {
      return ['__error' => [400, 'role inválido']];
    }
    $messages = $body['messages'] ?? [];
    if (!is_array($messages)) $messages = [];
    if (count($messages) > $relayBatchMaxL) {
      $messages = array_slice($messages, -$relayBatchMaxL);
    }
    $next = (int)($room['relayNextId'] ?? 1);
    if ($next < 1) $next = 1;
    if (!isset($room['relay']) || !is_array($room['relay'])) $room['relay'] = [];
    foreach ($messages as $m) {
      if (!is_array($m)) continue;
      $enc = json_encode($m, JSON_UNESCAPED_UNICODE);
      if ($enc === false || strlen($enc) > $relayMsgMaxBytesL) continue;
      $room['relay'][] = ['id' => $next++, 'from' => $role, 'm' => $m];
    }
    $room['relayNextId'] = $next;
    $room['relayMode'] = true;
    // Prioriza eventos: se estourar o cap, descarta pose/snap antigos primeiro
    if (count($room['relay']) > $relayCapL) {
      $keep = [];
      $events = [];
      $rest = [];
      foreach ($room['relay'] as $entry) {
        $t = $entry['m']['t'] ?? '';
        if ($t === 'event' || $t === 'hello') $events[] = $entry;
        else $rest[] = $entry;
      }
      $budget = $relayCapL - count($events);
      if ($budget < 0) {
        $events = array_slice($events, $budget); // keep newest events
        $budget = 0;
      }
      $rest = array_slice($rest, -$budget);
      $room['relay'] = array_values(array_merge($rest, $events));
      usort($room['relay'], function ($a, $b) {
        return ((int)($a['id'] ?? 0)) <=> ((int)($b['id'] ?? 0));
      });
    }
    return ['ok' => true, 'relayLastId' => last_relay_id($room['relay'])];
  });
  if (isset($out['__error'])) {
    http_response_code($out['__error'][0]);
    echo json_encode(['error' => $out['__error'][1]]);
    exit;
  }
  echo json_encode($out);
  exit;
}

if ($action === 'poll') {
  $path = room_path($roomsDir, $body['code'] ?? ($_GET['code'] ?? ''));
  $room = read_room($path);
  if (!$room) {
    http_response_code(404);
    echo json_encode(['error' => 'Sala não encontrada']);
    exit;
  }
  // Renova TTL enquanto há handshake ativo
  @touch($path);

  $sinceHost = (int)($body['sinceHostIce'] ?? ($_GET['sinceHostIce'] ?? 0));
  $sinceGuest = (int)($body['sinceGuestIce'] ?? ($_GET['sinceGuestIce'] ?? 0));
  $sinceRelay = (int)($body['sinceRelay'] ?? ($_GET['sinceRelay'] ?? 0));
  $role = (string)($body['role'] ?? ($_GET['role'] ?? ''));
  list($hostIce, $hostLast) = ice_since($room['hostIce'] ?? [], $sinceHost);
  list($guestIce, $guestLast) = ice_since($room['guestIce'] ?? [], $sinceGuest);
  if ($hostLast < $sinceHost) $hostLast = $sinceHost;
  if ($guestLast < $sinceGuest) $guestLast = $sinceGuest;
  // lastId absoluto na sala (cliente pode avançar mesmo sem novos)
  $hostAbs = last_ice_id($room['hostIce'] ?? []);
  $guestAbs = last_ice_id($room['guestIce'] ?? []);
  if ($hostAbs > $hostLast) $hostLast = $hostAbs;
  if ($guestAbs > $guestLast) $guestLast = $guestAbs;

  list($relayMsgs, $relayLast) = relay_since($room['relay'] ?? [], $sinceRelay, $role);
  $relayAbs = last_relay_id($room['relay'] ?? []);
  if ($relayAbs > $relayLast) $relayLast = $relayAbs;
  if ($relayLast < $sinceRelay) $relayLast = $sinceRelay;

  echo json_encode([
    'ok' => true,
    'code' => $room['code'],
    'seed' => $room['seed'],
    'guestJoined' => !empty($room['guestJoined']),
    'hostReady' => !empty($room['hostReady']),
    'relayMode' => !empty($room['relayMode']),
    'needsHostRestart' => !empty($room['needsHostRestart']),
    'offer' => $room['offer'],
    'answer' => $room['answer'],
    'hostIce' => $hostIce,
    'guestIce' => $guestIce,
    'hostIceTotal' => $hostAbs,
    'guestIceTotal' => $guestAbs,
    'hostIceLastId' => $hostAbs,
    'guestIceLastId' => $guestAbs,
    'relayMsgs' => $relayMsgs,
    'relayLastId' => $relayLast,
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

http_response_code(400);
echo json_encode(['error' => 'Ação inválida. Use ping|create|join|publish|poll|relay']);
