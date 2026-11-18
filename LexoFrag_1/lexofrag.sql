-- ============================================================================
-- LexoFrag Ops — prototype database
-- Target: MySQL 8.0+ / MariaDB 10.5+
-- Mirrors what index.html keeps in the browser today:
--   DEMO_USERS      -> users
--   inventoryDB     -> products
--   audit-log <ul>  -> stock_audit_log
--   KPI strip       -> v_dashboard_kpis
-- PROTOTYPE ONLY: passwords are plain text on purpose.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS lexofrag
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lexofrag;

DROP VIEW      IF EXISTS v_audit_feed;
DROP VIEW      IF EXISTS v_inventory_list;
DROP VIEW      IF EXISTS v_dashboard_kpis;
DROP PROCEDURE IF EXISTS sp_login;
DROP PROCEDURE IF EXISTS sp_lookup_sku;
DROP PROCEDURE IF EXISTS sp_save_stock;
DROP PROCEDURE IF EXISTS sp_add_sku;
DROP PROCEDURE IF EXISTS sp_reset_demo;
DROP TABLE     IF EXISTS stock_audit_log;
DROP TABLE     IF EXISTS products;
DROP TABLE     IF EXISTS users;

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  email      VARCHAR(120) NOT NULL PRIMARY KEY,
  password   VARCHAR(120) NOT NULL,                 -- plain text (prototype)
  name       VARCHAR(80)  NOT NULL,
  role       ENUM('Owner','Admin') NOT NULL,         -- Owner = full, Admin = audit only
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  sku        VARCHAR(40)  NOT NULL PRIMARY KEY,      -- barcode / SKU code, UPPERCASE
  seq        BIGINT       NOT NULL AUTO_INCREMENT UNIQUE,  -- keeps list in insertion order
  name       VARCHAR(120) NOT NULL,
  rack       VARCHAR(40)  NOT NULL,
  stock      INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_stock_not_negative CHECK (stock >= 0)
);

CREATE TABLE stock_audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  sku        VARCHAR(40)  NOT NULL,
  old_stock  INT          NOT NULL,
  new_stock  INT          NOT NULL,
  diff       INT GENERATED ALWAYS AS (new_stock - old_stock) STORED,
  updated_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_sku  FOREIGN KEY (sku)        REFERENCES products(sku) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_audit_user FOREIGN KEY (updated_by) REFERENCES users(email)  ON UPDATE CASCADE
);

-- ----------------------------------------------------------------------------
-- 2. SEED DATA (same as DEMO_USERS and DEFAULT_INVENTORY in index.html)
-- ----------------------------------------------------------------------------
INSERT INTO users (email, password, name, role) VALUES
  ('saif@lexofrag.my',  'lexo123',  'Encik Saif',      'Owner'),
  ('staff@lexofrag.my', 'staff123', 'Storeroom Staff', 'Admin');

INSERT INTO products (sku, name, rack, stock) VALUES
  ('LF-10ML-VAN', 'Vanilla Mist (10ml Liquid)',      'Rack A1', 24),
  ('LF-10ML-COF', 'Roasted Arabica Coffee (10ml)',   'Rack A2', 12),
  ('LF-10ML-LAV', 'Midnight Lavender (10ml)',        'Rack B1',  3);

-- ----------------------------------------------------------------------------
-- 3. VIEWS
-- ----------------------------------------------------------------------------

-- KPI strip: Registered SKUs / Total Bottles / Low Stock (<=5)
CREATE VIEW v_dashboard_kpis AS
SELECT COUNT(*)                          AS total_skus,
       COALESCE(SUM(stock), 0)           AS total_units,
       COALESCE(SUM(stock <= 5), 0)      AS low_stock_count
FROM products;

-- Rack Inventory List table
CREATE VIEW v_inventory_list AS
SELECT sku, name, rack, stock, (stock <= 5) AS is_low
FROM products
ORDER BY seq;

-- Audit Activity Log feed, newest first: "LF-10ML-VAN (24 -> 20)  +/-n  by X at HH:MM"
CREATE VIEW v_audit_feed AS
SELECT a.id,
       a.sku,
       a.old_stock,
       a.new_stock,
       a.diff,
       CASE WHEN a.diff > 0 THEN CONCAT('+', a.diff) ELSE CAST(a.diff AS CHAR) END AS diff_label,
       u.name                          AS actor,
       DATE_FORMAT(a.created_at, '%H:%i') AS time_label,
       a.created_at
FROM stock_audit_log a
JOIN users u ON u.email = a.updated_by
ORDER BY a.created_at DESC, a.id DESC;

-- ----------------------------------------------------------------------------
-- 4. PROCEDURES (one per dashboard action)
-- ----------------------------------------------------------------------------
DELIMITER //

-- loginWithCredentials(): returns one row on success, zero rows on failure
CREATE PROCEDURE sp_login(IN p_email VARCHAR(120), IN p_password VARCHAR(120))
BEGIN
  SELECT email, name, role
  FROM users
  WHERE email = LOWER(TRIM(p_email)) AND password = p_password;
END//

-- lookupBarcode(): zero rows = "SKU Not Found" card
CREATE PROCEDURE sp_lookup_sku(IN p_code VARCHAR(40))
BEGIN
  SELECT sku, name, rack, stock
  FROM products
  WHERE sku = UPPER(TRIM(p_code));
END//

-- saveStockUpdate(): validates, updates stock and writes the audit row
CREATE PROCEDURE sp_save_stock(
  IN p_sku VARCHAR(40),
  IN p_new_stock INT,
  IN p_user_email VARCHAR(120)
)
BEGIN
  DECLARE v_old INT DEFAULT NULL;

  IF p_new_stock IS NULL OR p_new_stock < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Save rejected: Stock balance cannot be negative.';
  END IF;

  START TRANSACTION;

  SELECT stock INTO v_old FROM products WHERE sku = UPPER(TRIM(p_sku)) FOR UPDATE;

  IF v_old IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SKU not found.';
  END IF;

  UPDATE products SET stock = p_new_stock WHERE sku = UPPER(TRIM(p_sku));

  INSERT INTO stock_audit_log (sku, old_stock, new_stock, updated_by)
  VALUES (UPPER(TRIM(p_sku)), v_old, p_new_stock, p_user_email);

  COMMIT;

  -- Same numbers the UI shows: "(old -> new)" and the +/- badge
  SELECT UPPER(TRIM(p_sku)) AS sku,
         v_old              AS old_stock,
         p_new_stock        AS new_stock,
         p_new_stock - v_old AS diff;
END//

-- handleAddNewSku(): same behaviour as the JS (existing code gets overwritten)
CREATE PROCEDURE sp_add_sku(
  IN p_code  VARCHAR(40),
  IN p_name  VARCHAR(120),
  IN p_rack  VARCHAR(40),
  IN p_stock INT
)
BEGIN
  INSERT INTO products (sku, name, rack, stock)
  VALUES (UPPER(TRIM(p_code)), TRIM(p_name), TRIM(p_rack), GREATEST(COALESCE(p_stock, 0), 0))
  ON DUPLICATE KEY UPDATE
    name  = VALUES(name),
    rack  = VALUES(rack),
    stock = VALUES(stock);

  SELECT sku, name, rack, stock FROM products WHERE sku = UPPER(TRIM(p_code));
END//

-- resetDemoData(): back to the 3 starting SKUs and an empty audit log
CREATE PROCEDURE sp_reset_demo()
BEGIN
  DELETE FROM stock_audit_log;
  DELETE FROM products;
  INSERT INTO products (sku, name, rack, stock) VALUES
    ('LF-10ML-VAN', 'Vanilla Mist (10ml Liquid)',    'Rack A1', 24),
    ('LF-10ML-COF', 'Roasted Arabica Coffee (10ml)', 'Rack A2', 12),
    ('LF-10ML-LAV', 'Midnight Lavender (10ml)',      'Rack B1',  3);
END//

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 5. QUICK TEST (uncomment to try)
-- ----------------------------------------------------------------------------
-- CALL sp_login('saif@lexofrag.my', 'lexo123');
-- CALL sp_lookup_sku('lf-10ml-van');
-- CALL sp_save_stock('LF-10ML-VAN', 20, 'saif@lexofrag.my');
-- SELECT * FROM v_dashboard_kpis;
-- SELECT * FROM v_inventory_list;
-- SELECT * FROM v_audit_feed;
-- CALL sp_add_sku('LF-10ML-STR', 'Sweet Strawberry (10ml)', 'Rack B2', 10);
-- CALL sp_reset_demo();
