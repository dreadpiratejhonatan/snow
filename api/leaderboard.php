<?php
/**
 * Leaderboard Neve Selvagem — GET lista | POST {name, timeMs}
 * Persistência: data/leaderboard.json (com flock)
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
$file = $dataDir . '/leaderboard.json';
$maxEntries = 50;

if (!is_dir($dataDir)) {
  mkdir($dataDir, 0755, true);
}
if (!file_exists($file)) {
  file_put_contents($file, json_encode(['entries' => []], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function read_board($file) {
  $fp = fopen($file, 'c+');
  if (!$fp) return [null, ['entries' => []]];
  flock($fp, LOCK_SH);
  $raw = stream_get_contents($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
  $data = json_decode($raw ?: '{}', true);
  if (!is_array($data) || !isset($data['entries']) || !is_array($data['entries'])) {
    $data = ['entries' => []];
  }
  return [null, $data];
}

function write_board($file, $data) {
  $fp = fopen($file, 'c+');
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

function rate_limited($dataDir) {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
  $safe = preg_replace('/[^a-zA-Z0-9_.-]/', '_', $ip);
  $rf = $dataDir . '/rate_' . $safe . '.txt';
  $now = time();
  if (file_exists($rf)) {
    $last = (int)file_get_contents($rf);
    if ($now - $last < 8) return true; // 1 post / 8s por IP
  }
  file_put_contents($rf, (string)$now);
  return false;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  [, $data] = read_board($file);
  $limit = isset($_GET['limit']) ? max(1, min(50, (int)$_GET['limit'])) : 10;
  $entries = $data['entries'];
  usort($entries, function ($a, $b) {
    return ($a['timeMs'] ?? PHP_INT_MAX) <=> ($b['timeMs'] ?? PHP_INT_MAX);
  });
  echo json_encode(['entries' => array_slice($entries, 0, $limit)], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($method === 'POST') {
  if (rate_limited($dataDir)) {
    http_response_code(429);
    echo json_encode(['error' => 'Aguarde alguns segundos antes de enviar de novo.']);
    exit;
  }

  $body = json_decode(file_get_contents('php://input') ?: '{}', true);
  if (!is_array($body)) $body = [];

  $name = trim((string)($body['name'] ?? ''));
  $name = preg_replace('/[^\p{L}\p{N} _.-]/u', '', $name);
  $name = mb_substr($name, 0, 16);
  $timeMs = (int)($body['timeMs'] ?? 0);

  if (mb_strlen($name) < 2) {
    http_response_code(400);
    echo json_encode(['error' => 'Nome inválido (mín. 2 caracteres).']);
    exit;
  }
  if ($timeMs < 5000 || $timeMs > 86400000) {
    http_response_code(400);
    echo json_encode(['error' => 'Tempo inválido.']);
    exit;
  }

  [, $data] = read_board($file);
  $data['entries'][] = [
    'name' => $name,
    'timeMs' => $timeMs,
    'at' => gmdate('c'),
  ];
  usort($data['entries'], function ($a, $b) {
    return ($a['timeMs'] ?? PHP_INT_MAX) <=> ($b['timeMs'] ?? PHP_INT_MAX);
  });
  $data['entries'] = array_slice($data['entries'], 0, $maxEntries);

  if (!write_board($file, $data)) {
    http_response_code(500);
    echo json_encode(['error' => 'Falha ao gravar.']);
    exit;
  }

  $rank = 1;
  foreach ($data['entries'] as $i => $e) {
    if (($e['name'] ?? '') === $name && (int)($e['timeMs'] ?? 0) === $timeMs) {
      $rank = $i + 1;
      break;
    }
  }

  echo json_encode([
    'ok' => true,
    'rank' => $rank,
    'entries' => array_slice($data['entries'], 0, 10),
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método não permitido']);
