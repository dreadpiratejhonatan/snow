<?php
/**
 * Signaling WebRTC para co-op 2P — NÃO simula o jogo.
 * Ações JSON: create | join | publish | poll
 * Rooms: data/rooms/{CODE}.json (TTL 10 min)
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
$ttlSec = 600;

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

cleanup_rooms($roomsDir, $ttlSec);

$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) $body = [];
}
$action = $body['action'] ?? ($_GET['action'] ?? '');

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
  ];
  if (!write_room($roomsDir . '/' . $code . '.json', $room)) {
    http_response_code(500);
    echo json_encode(['error' => 'Falha ao gravar sala']);
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
  if (!empty($room['guestJoined'])) {
    http_response_code(409);
    echo json_encode(['error' => 'Sala já tem 2 jogadores']);
    exit;
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
      $room['hostIce'] = array_slice(array_merge($room['hostIce'] ?? [], $body['ice']), -40);
    }
    $room['hostReady'] = true;
  } elseif ($role === 'guest') {
    if (isset($body['answer'])) $room['answer'] = $body['answer'];
    if (isset($body['ice']) && is_array($body['ice'])) {
      $room['guestIce'] = array_slice(array_merge($room['guestIce'] ?? [], $body['ice']), -40);
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
  $role = $body['role'] ?? ($_GET['role'] ?? '');
  $sinceHost = (int)($body['sinceHostIce'] ?? ($_GET['sinceHostIce'] ?? 0));
  $sinceGuest = (int)($body['sinceGuestIce'] ?? ($_GET['sinceGuestIce'] ?? 0));
  $hostIce = array_slice($room['hostIce'] ?? [], $sinceHost);
  $guestIce = array_slice($room['guestIce'] ?? [], $sinceGuest);
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
    'hostIceTotal' => count($room['hostIce'] ?? []),
    'guestIceTotal' => count($room['guestIce'] ?? []),
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

http_response_code(400);
echo json_encode(['error' => 'Ação inválida. Use create|join|publish|poll']);
