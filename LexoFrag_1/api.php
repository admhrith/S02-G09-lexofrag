<?php
// LexoFrag Ops — thin JSON API between index.html and lexofrag.sql (prototype).
// Every action maps to one stored procedure / view from lexofrag.sql.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
session_start();

const DB_HOST = '127.0.0.1';
const DB_NAME = 'lexofrag';
const DB_USER = 'root';   // change to your MySQL user
const DB_PASS = '';       // change to your MySQL password

function out(array $data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data);
  exit;
}

function db(): PDO {
  return new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
}

function q(PDO $pdo, string $sql, array $params = []): array {
  $st = $pdo->prepare($sql);
  $st->execute($params);
  $rows = $st->columnCount() ? $st->fetchAll() : [];
  while ($st->nextRowset()) { /* drain CALL status sets */ }
  $st->closeCursor();
  return $rows;
}

function product(array $r): array {
  return ['sku' => $r['sku'], 'name' => $r['name'], 'rack' => $r['rack'], 'stock' => (int)$r['stock']];
}

$in     = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
$action = $_GET['action'] ?? '';
$user   = $_SESSION['user'] ?? null;

try {
  $pdo = db(); // also makes "ping" fail (-> offline mode) when the database is down

  switch ($action) {
    case 'ping':
      out(['ok' => true]);

    case 'me':
      out(['user' => $user]);

    case 'logout':
      $_SESSION = [];
      session_destroy();
      out(['ok' => true]);

    case 'login':
      $rows = q($pdo, 'CALL sp_login(?, ?)', [(string)($in['email'] ?? ''), (string)($in['password'] ?? '')]);
      if (!$rows) out(['error' => 'Invalid email or password.'], 401);
      session_regenerate_id(true);
      $_SESSION['user'] = $rows[0];
      out(['user' => $rows[0]]);
  }

  if (!$user) out(['error' => 'Not signed in.'], 401);
  $owner = $user['role'] === 'Owner';

  switch ($action) {
    case 'state': // KPI strip is derived in the UI from the same rows (v_dashboard_kpis = same maths)
      $products = array_map('product', q($pdo, 'SELECT sku, name, rack, stock FROM v_inventory_list'));
      $audit = array_map(fn($r) => [
        'sku' => $r['sku'], 'old_stock' => (int)$r['old_stock'], 'new_stock' => (int)$r['new_stock'],
        'diff' => (int)$r['diff'], 'actor' => $r['actor'], 'time_label' => $r['time_label'],
      ], q($pdo, 'SELECT sku, old_stock, new_stock, diff, actor, time_label FROM v_audit_feed LIMIT 50'));
      out(['products' => $products, 'audit' => $audit]);

    case 'lookup':
      $rows = q($pdo, 'CALL sp_lookup_sku(?)', [(string)($in['code'] ?? '')]);
      out(['product' => $rows ? product($rows[0]) : null]);

    case 'save':
      $n = filter_var($in['new_stock'] ?? null, FILTER_VALIDATE_INT);
      if ($n === false || $n < 0) out(['error' => 'Save rejected: Stock balance cannot be negative.'], 422);
      $rows = q($pdo, 'CALL sp_save_stock(?, ?, ?)', [(string)($in['sku'] ?? ''), $n, $user['email']]);
      out(['result' => $rows[0] ?? null]);

    case 'add':
      if (!$owner) out(['error' => 'Owner access required.'], 403);
      $rows = q($pdo, 'CALL sp_add_sku(?, ?, ?, ?)', [
        (string)($in['code'] ?? ''), (string)($in['name'] ?? ''), (string)($in['rack'] ?? ''), (int)($in['stock'] ?? 0),
      ]);
      out(['product' => $rows ? product($rows[0]) : null]);

    case 'reset':
      if (!$owner) out(['error' => 'Owner access required.'], 403);
      q($pdo, 'CALL sp_reset_demo()');
      out(['ok' => true]);
  }

  out(['error' => 'Unknown action.'], 400);
} catch (PDOException $e) {
  $msg = $e->errorInfo[2] ?? 'Database unavailable.';
  out(['error' => $msg], ($e->errorInfo[0] ?? '') === '45000' ? 422 : 500);
}
