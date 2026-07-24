<?php
/**
 * Signaling WebRTC para co-op 2P — NÃO simula o jogo.
 * Ações JSON: ping | create | join | publish | poll
 * Rooms: data/rooms/{CODE}.json (TTL 30 min)
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
  $room = read_room($path);
  if (!$room) {
    http_response_code(404);
    echo json_encode(['error' => 'Sala não encontrada ou expirou']);
    exit;
  }
  // Rejoin: guest marcado mas handshake incompleto (sem answer) → permite nova entrada
  if (!empty($room['guestJoined']) && !empty($room['answer'])) {
    http_response_code(409);
    echo json_encode(['error' => 'Sala já tem 2 jogadores — peça ao host criar sala nova']);
    exit;
  }
  if (!empty($room['guestJoined']) && empty($room['answer'])) {
    $room['guestIce'] = [];
    $room['guestIceNextId'] = 1;
    $room['answer'] = null;
  }
  $room['guestJoined'] = true;
  write_room($path, $room);
  echo json_encode([
    'ok' => true,
    'code' => $room['code'],
    'seed' => $room['seed'],
    'role' => 'guest',
  ]);
  exit;
}

if ($action === 'publish') {
  $path = room_path($roomsDir, $body['code'] ?? '');
  $room = read_room($path);
  if (!$room) {
    http_response_code(404);
    echo json_encode(['error' => 'Sala não encontrada']);
    exit;
  }
  $role = $body['role'] ?? '';
  if ($role === 'host') {
    if (isset($body['offer'])) $room['offer'] = $body['offer'];
    if (isset($body['ice']) && is_array($body['ice'])) {
      $next = (int)($room['hostIceNextId'] ?? 1);
      append_ice($room['hostIce'], $body['ice'], $next, $iceCap);
      $room['hostIceNextId'] = $next;
    }
    $room['hostReady'] = true;
  } elseif ($role === 'guest') {
    if (isset($body['answer'])) $room['answer'] = $body['answer'];
    if (isset($body['ice']) && is_array($body['ice'])) {
      $next = (int)($room['guestIceNextId'] ?? 1);
      append_ice($room['guestIce'], $body['ice'], $next, $iceCap);
      $room['guestIceNextId'] = $next;
    }
  } else {
    http_response_code(400);
    echo json_encode(['error' => 'role inválido']);
    exit;
  }
  write_room($path, $room);
  echo json_encode(['ok' => true]);
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
  list($hostIce, $hostLast) = ice_since($room['hostIce'] ?? [], $sinceHost);
  list($guestIce, $guestLast) = ice_since($room['guestIce'] ?? [], $sinceGuest);
  if ($hostLast < $sinceHost) $hostLast = $sinceHost;
  if ($guestLast < $sinceGuest) $guestLast = $sinceGuest;
  // lastId absoluto na sala (cliente pode avançar mesmo sem novos)
  $hostAbs = last_ice_id($room['hostIce'] ?? []);
  $guestAbs = last_ice_id($room['guestIce'] ?? []);
  if ($hostAbs > $hostLast) $hostLast = $hostAbs;
  if ($guestAbs > $guestLast) $guestLast = $guestAbs;

  echo json_encode([
    'ok' => true,
    'code' => $room['code'],
    'seed' => $room['seed'],
    'guestJoined' => !empty($room['guestJoined']),
    'hostReady' => !empty($room['hostReady']),
    'offer' => $room['offer'],
    'answer' => $room['answer'],
    'hostIce' => $hostIce,
    'guestIce' => $guestIce,
    'hostIceTotal' => $hostAbs,
    'guestIceTotal' => $guestAbs,
    'hostIceLastId' => $hostAbs,
    'guestIceLastId' => $guestAbs,
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

http_response_code(400);
echo json_encode(['error' => 'Ação inválida. Use ping|create|join|publish|poll']);
