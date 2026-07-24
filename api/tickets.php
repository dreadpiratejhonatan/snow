<?php
/**
 * Tickets públicos — bugs e sugestões (Neve Selvagem).
 * GET  listar  | POST create | POST status (admin)
 * Persistência: data/tickets.json
 *
 * Senha admin: arquivo data/tickets-admin.key (1 linha)
 * ou altere TICKETS_ADMIN_KEY abaixo (não use o placeholder em produção).
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

/** Placeholder — troque no servidor ou use data/tickets-admin.key */
define('TICKETS_ADMIN_KEY', 'CHANGE_ME_TICKETS_ADMIN');

$dataDir = dirname(__DIR__) . '/data';
$file = $dataDir . '/tickets.json';
$rateFile = $dataDir . '/tickets-rate.json';
$maxTickets = 400;
$createMax = 5;
$createWindowSec = 600; // 10 min

$allowedTypes = ['bug', 'feature'];
$allowedStatus = ['open', 'doing', 'done', 'wontfix'];

if (!is_dir($dataDir)) mkdir($dataDir, 0755, true);
if (!file_exists($file)) {
  file_put_contents($file, json_encode(['tickets' => []], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function admin_key_ok($dataDir, $given) {
  $given = (string)$given;
  if ($given === '') return false;
  $path = $dataDir . '/tickets-admin.key';
  $expected = TICKETS_ADMIN_KEY;
  if (is_file($path)) {
    $fromFile = trim((string)file_get_contents($path));
    if ($fromFile !== '') $expected = $fromFile;
  }
  if ($expected === '' || $expected === 'CHANGE_ME_TICKETS_ADMIN') {
    return false; // força configurar no servidor
  }
  return hash_equals($expected, $given);
}

function read_json_locked($path, $fallback) {
  $fp = fopen($path, 'c+');
  if (!$fp) return $fallback;
  flock($fp, LOCK_SH);
  $raw = stream_get_contents($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  $data = json_decode($raw ?: '', true);
  return is_array($data) ? $data : $fallback;
}

function write_json_locked($path, $data) {
  $fp = fopen($path, 'c+');
  if (!$fp) return false;
  flock($fp, LOCK_EX);
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  return true;
}

function client_ip() {
  return $_SERVER['REMOTE_ADDR'] ?? '0';
}

function strip_text($s) {
  $s = strip_tags((string)$s);
  $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s);
  return trim($s);
}

function create_rate_limited($rateFile, $ip, $max, $windowSec) {
  $data = read_json_locked($rateFile, ['hits' => []]);
  if (!isset($data['hits']) || !is_array($data['hits'])) $data['hits'] = [];
  $now = time();
  $cut = $now - $windowSec;
  $list = [];
  foreach ($data['hits'] as $row) {
    if (!is_array($row)) continue;
    if (($row['ip'] ?? '') === $ip && (int)($row['at'] ?? 0) >= $cut) {
      $list[] = $row;
    }
  }
  if (count($list) >= $max) {
    return true;
  }
  $all = [];
  foreach ($data['hits'] as $row) {
    if (!is_array($row)) continue;
    if ((int)($row['at'] ?? 0) >= $cut) $all[] = $row;
  }
  $all[] = ['ip' => $ip, 'at' => $now];
  if (count($all) > 2000) $all = array_slice($all, -1500);
  write_json_locked($rateFile, ['hits' => $all]);
  return false;
}

function normalize_ticket($t) {
  if (!is_array($t)) return null;
  $id = trim((string)($t['id'] ?? ''));
  $type = $t['type'] ?? '';
  $status = $t['status'] ?? 'open';
  $title = strip_text($t['title'] ?? '');
  $body = strip_text($t['body'] ?? '');
  if ($id === '' || $title === '') return null;
  return [
    'id' => $id,
    'type' => in_array($type, ['bug', 'feature'], true) ? $type : 'bug',
    'title' => mb_substr($title, 0, 80),
    'body' => mb_substr($body, 0, 2000),
    'name' => mb_substr(strip_text($t['name'] ?? ''), 0, 24),
    'status' => in_array($status, ['open', 'doing', 'done', 'wontfix'], true) ? $status : 'open',
    'createdAt' => $t['createdAt'] ?? gmdate('c'),
    'updatedAt' => $t['updatedAt'] ?? ($t['createdAt'] ?? gmdate('c')),
  ];
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $data = read_json_locked($file, ['tickets' => []]);
  $tickets = [];
  foreach ($data['tickets'] ?? [] as $t) {
    $n = normalize_ticket($t);
    if ($n) $tickets[] = $n;
  }
  $type = isset($_GET['type']) ? strtolower(trim((string)$_GET['type'])) : '';
  $status = isset($_GET['status']) ? strtolower(trim((string)$_GET['status'])) : '';
  if ($type === 'bug' || $type === 'feature') {
    $tickets = array_values(array_filter($tickets, function ($t) use ($type) {
      return $t['type'] === $type;
    }));
  }
  if (in_array($status, $allowedStatus, true)) {
    $tickets = array_values(array_filter($tickets, function ($t) use ($status) {
      return $t['status'] === $status;
    }));
  }
  // mais novos primeiro
  usort($tickets, function ($a, $b) {
    return strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? '');
  });
  echo json_encode(['ok' => true, 'tickets' => $tickets], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($method === 'POST') {
  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) $body = [];
  $action = $body['action'] ?? '';

  if ($action === 'create') {
    $ip = client_ip();
    if (create_rate_limited($rateFile, $ip, $createMax, $createWindowSec)) {
      http_response_code(429);
      echo json_encode(['error' => 'Muitos envios. Aguarde alguns minutos.']);
      exit;
    }

    $type = strtolower(trim((string)($body['type'] ?? '')));
    $title = strip_text($body['title'] ?? '');
    $text = strip_text($body['body'] ?? '');
    $name = mb_substr(strip_text($body['name'] ?? ''), 0, 24);

    if (!in_array($type, $allowedTypes, true)) {
      http_response_code(400);
      echo json_encode(['error' => 'Tipo inválido (bug ou feature).']);
      exit;
    }
    if (mb_strlen($title) < 3 || mb_strlen($title) > 80) {
      http_response_code(400);
      echo json_encode(['error' => 'Título: entre 3 e 80 caracteres.']);
      exit;
    }
    if (mb_strlen($text) < 10 || mb_strlen($text) > 2000) {
      http_response_code(400);
      echo json_encode(['error' => 'Descrição: entre 10 e 2000 caracteres.']);
      exit;
    }

    $data = read_json_locked($file, ['tickets' => []]);
    if (!isset($data['tickets']) || !is_array($data['tickets'])) $data['tickets'] = [];

    $now = gmdate('c');
    $ticket = [
      'id' => bin2hex(random_bytes(8)),
      'type' => $type,
      'title' => $title,
      'body' => $text,
      'name' => $name,
      'status' => 'open',
      'createdAt' => $now,
      'updatedAt' => $now,
    ];
    array_unshift($data['tickets'], $ticket);
    if (count($data['tickets']) > $maxTickets) {
      $data['tickets'] = array_slice($data['tickets'], 0, $maxTickets);
    }

    if (!write_json_locked($file, $data)) {
      http_response_code(500);
      echo json_encode(['error' => 'Falha ao gravar. Verifique permissões de data/.']);
      exit;
    }

    echo json_encode(['ok' => true, 'ticket' => $ticket], JSON_UNESCAPED_UNICODE);
    exit;
  }

  if ($action === 'status') {
    if (!admin_key_ok($dataDir, $body['adminKey'] ?? '')) {
      http_response_code(403);
      echo json_encode(['error' => 'Senha de admin inválida ou não configurada no servidor.']);
      exit;
    }
    $id = trim((string)($body['id'] ?? ''));
    $status = strtolower(trim((string)($body['status'] ?? '')));
    if ($id === '' || !in_array($status, $allowedStatus, true)) {
      http_response_code(400);
      echo json_encode(['error' => 'id ou status inválido.']);
      exit;
    }

    $data = read_json_locked($file, ['tickets' => []]);
    $found = false;
    foreach ($data['tickets'] as &$t) {
      if (($t['id'] ?? '') === $id) {
        $t['status'] = $status;
        $t['updatedAt'] = gmdate('c');
        $found = true;
        $updated = normalize_ticket($t);
        break;
      }
    }
    unset($t);

    if (!$found) {
      http_response_code(404);
      echo json_encode(['error' => 'Ticket não encontrado.']);
      exit;
    }

    if (!write_json_locked($file, $data)) {
      http_response_code(500);
      echo json_encode(['error' => 'Falha ao gravar.']);
      exit;
    }

    echo json_encode(['ok' => true, 'ticket' => $updated], JSON_UNESCAPED_UNICODE);
    exit;
  }

  http_response_code(400);
  echo json_encode(['error' => 'Ação inválida. Use create|status']);
  exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método não permitido']);
