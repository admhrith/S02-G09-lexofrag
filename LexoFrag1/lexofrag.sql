-- ============================================================================
-- LexoFrag Ops — prototype database
-- Target: MySQL 8.0+ / MariaDB 10.5+   (tested on MariaDB 10.11)
-- Mirrors what index.html keeps in the browser when api.php is not available:
--   DEMO_USERS      -> users
--   inventoryDB     -> products          (real LexoFrag catalogue, 14 SKUs)
--   audit-log <ul>  -> stock_audit_log
--   ordersDB        -> orders + order_items
-- PROTOTYPE ONLY: passwords are plain text on purpose.
-- Starting stock quantities are PLACEHOLDERS - set real counts by scanning each rack.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS lexofrag
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lexofrag;

DROP VIEW      IF EXISTS v_audit_feed;
DROP VIEW      IF EXISTS v_inventory_list;
DROP VIEW      IF EXISTS v_dashboard_kpis;
DROP VIEW      IF EXISTS v_orders_feed;
DROP VIEW      IF EXISTS v_order_items;
DROP PROCEDURE IF EXISTS sp_login;
DROP PROCEDURE IF EXISTS sp_lookup_sku;
DROP PROCEDURE IF EXISTS sp_save_stock;
DROP PROCEDURE IF EXISTS sp_add_sku;
DROP PROCEDURE IF EXISTS sp_reset_demo;
DROP PROCEDURE IF EXISTS sp_seed_products;
DROP PROCEDURE IF EXISTS sp_order_create;
DROP PROCEDURE IF EXISTS sp_order_add_item;
DROP PROCEDURE IF EXISTS sp_order_set_status;
DROP TABLE     IF EXISTS order_items;
DROP TABLE     IF EXISTS orders;
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
  role       ENUM('Owner','Admin') NOT NULL,         -- Owner = full, Admin = audit + order fulfilment
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  sku           VARCHAR(40)  NOT NULL PRIMARY KEY,   -- barcode / SKU code, UPPERCASE
  seq           BIGINT       NOT NULL AUTO_INCREMENT UNIQUE,  -- keeps list in insertion order
  name          VARCHAR(120) NOT NULL,
  rack          VARCHAR(40)  NOT NULL,
  stock         INT          NOT NULL DEFAULT 0,
  line          VARCHAR(40)  NOT NULL DEFAULT 'Classic Edition',  -- Classic / Signature / Deluxe
  size_ml       INT          NOT NULL DEFAULT 10,                 -- 10 = hanging diffuser, 50 = standing jar
  regular_price DECIMAL(8,2) NOT NULL DEFAULT 0,
  sale_price    DECIMAL(8,2) NOT NULL DEFAULT 0,                  -- current selling price (RM)
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

CREATE TABLE orders (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_no      VARCHAR(20)  NOT NULL DEFAULT '' ,   -- ORD-00001 (set right after insert)
  customer_name VARCHAR(120) NOT NULL,
  phone         VARCHAR(30)  NOT NULL DEFAULT '',
  address       VARCHAR(255) NOT NULL DEFAULT '',
  channel       ENUM('TikTok Shop','COD','Direct Message','Website') NOT NULL DEFAULT 'COD',
  status        ENUM('New','Packed','Shipped','Delivered','Cancelled') NOT NULL DEFAULT 'New',
  notes         VARCHAR(255) NOT NULL DEFAULT '',
  total         DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_by    VARCHAR(120) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_created (created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (created_by) REFERENCES users(email) ON UPDATE CASCADE
);

CREATE TABLE order_items (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id   BIGINT       NOT NULL,
  sku        VARCHAR(40)  NOT NULL,
  qty        INT          NOT NULL,
  unit_price DECIMAL(8,2) NOT NULL,                 -- price actually charged (can differ from sale_price)
  CONSTRAINT chk_item_qty CHECK (qty > 0),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id)   ON DELETE CASCADE,
  CONSTRAINT fk_item_sku   FOREIGN KEY (sku)      REFERENCES products(sku) ON UPDATE CASCADE
);

-- ----------------------------------------------------------------------------
-- 2. SEED DATA
-- ----------------------------------------------------------------------------
INSERT INTO users (email, password, name, role) VALUES
  ('saif@lexofrag.my',  'lexo123',  'Encik Saif',      'Owner'),
  ('staff@lexofrag.my', 'staff123', 'Storeroom Staff', 'Admin');

-- Real LexoFrag catalogue (TikTok Shop listings). SKU format: LF-<size><line>-<scent>
--   C = Classic 10ml, D = Deluxe, S = Signature 50ml.   Sale price = current promo price.
--   NOTE: Signature 50ml promo is RM15.34-16.84 on TikTok; RM15.34 is used for all scents.
DELIMITER //
CREATE PROCEDURE sp_seed_products()
BEGIN
  INSERT INTO products (sku, name, rack, stock, line, size_ml, regular_price, sale_price) VALUES
  ('LF-10C-MIX', 'Mix Fruit (Classic 10ml)', 'Rack A1', 20, 'Classic Edition', 10, 9.90, 4.95),
  ('LF-10C-VAN', 'Vanilla Ice (Classic 10ml)', 'Rack A2', 20, 'Classic Edition', 10, 9.90, 4.95),
  ('LF-10C-GUM', 'Sweet Gummy (Classic 10ml)', 'Rack A3', 20, 'Classic Edition', 10, 9.90, 4.95),
  ('LF-10D-APL', 'Dark Apple (Deluxe 10ml)', 'Rack B1', 20, 'Deluxe Edition', 10, 12.90, 11.40),
  ('LF-10D-SAK', 'Snowy Sakura (Deluxe 10ml)', 'Rack B2', 20, 'Deluxe Edition', 10, 12.90, 11.40),
  ('LF-10D-FRO', 'Frosty Dew (Deluxe 10ml)', 'Rack B3', 20, 'Deluxe Edition', 10, 12.90, 11.40),
  ('LF-50S-SEA', 'Breezy Sea (Signature 50ml)', 'Rack C1', 10, 'Signature', 50, 26.99, 15.34),
  ('LF-50S-MIX', 'Mix Fruit (Signature 50ml)', 'Rack C2', 10, 'Signature', 50, 26.99, 15.34),
  ('LF-50S-GUM', 'Sweet Gummy (Signature 50ml)', 'Rack C3', 10, 'Signature', 50, 26.99, 15.34),
  ('LF-50S-VAN', 'Vanilla Ice (Signature 50ml)', 'Rack C4', 10, 'Signature', 50, 26.99, 15.34),
  ('LF-50S-FLO', 'Warm Floral (Signature 50ml)', 'Rack C5', 10, 'Signature', 50, 26.99, 15.34),
  ('LF-50D-APL', 'Dark Apple (Deluxe 50ml)', 'Rack D1', 10, 'Deluxe Edition', 50, 29.90, 28.40),
  ('LF-50D-SAK', 'Snowy Sakura (Deluxe 50ml)', 'Rack D2', 10, 'Deluxe Edition', 50, 29.90, 28.40),
  ('LF-50D-FRO', 'Frosty Dew (Deluxe 50ml)', 'Rack D3', 10, 'Deluxe Edition', 50, 29.90, 28.40);
END//
DELIMITER ;

CALL sp_seed_products();

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
SELECT sku, name, rack, stock, line, size_ml, regular_price, sale_price, (stock <= 5) AS is_low
FROM products
ORDER BY seq;

-- Audit Activity Log feed, newest first
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

-- Orders list, newest first
CREATE VIEW v_orders_feed AS
SELECT o.id, o.order_no, o.customer_name, o.phone, o.address, o.channel, o.status, o.notes, o.total,
       u.name AS staff,
       DATE_FORMAT(o.created_at, '%d %b %H:%i') AS time_label,
       o.created_at
FROM orders o
JOIN users u ON u.email = o.created_by
ORDER BY o.created_at DESC, o.id DESC;

CREATE VIEW v_order_items AS
SELECT i.order_id, i.sku, p.name, i.qty, i.unit_price
FROM order_items i
JOIN products p ON p.sku = i.sku
ORDER BY i.id;

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
  SELECT sku, name, rack, stock, line, size_ml, regular_price, sale_price
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

  SELECT UPPER(TRIM(p_sku)) AS sku,
         v_old              AS old_stock,
         p_new_stock        AS new_stock,
         p_new_stock - v_old AS diff;
END//

-- handleAddNewSku(): existing code gets overwritten
CREATE PROCEDURE sp_add_sku(
  IN p_code  VARCHAR(40),
  IN p_name  VARCHAR(120),
  IN p_rack  VARCHAR(40),
  IN p_stock INT,
  IN p_line  VARCHAR(40),
  IN p_size  INT,
  IN p_regular DECIMAL(8,2),
  IN p_sale    DECIMAL(8,2)
)
BEGIN
  INSERT INTO products (sku, name, rack, stock, line, size_ml, regular_price, sale_price)
  VALUES (UPPER(TRIM(p_code)), TRIM(p_name), TRIM(p_rack), GREATEST(COALESCE(p_stock, 0), 0),
          TRIM(p_line), COALESCE(p_size, 10), GREATEST(COALESCE(p_regular, 0), 0), GREATEST(COALESCE(p_sale, 0), 0))
  ON DUPLICATE KEY UPDATE
    name = VALUES(name), rack = VALUES(rack), stock = VALUES(stock),
    line = VALUES(line), size_ml = VALUES(size_ml),
    regular_price = VALUES(regular_price), sale_price = VALUES(sale_price);

  SELECT sku, name, rack, stock, line, size_ml, regular_price, sale_price
  FROM products WHERE sku = UPPER(TRIM(p_code));
END//

-- Order step 1: create the header, returns the new id and order number.
-- Steps 1-2 are meant to run inside ONE transaction opened by the caller (api.php).
CREATE PROCEDURE sp_order_create(
  IN p_customer VARCHAR(120), IN p_phone VARCHAR(30), IN p_address VARCHAR(255),
  IN p_channel VARCHAR(20), IN p_notes VARCHAR(255), IN p_user VARCHAR(120)
)
BEGIN
  IF TRIM(COALESCE(p_customer, '')) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer name is required.';
  END IF;

  INSERT INTO orders (customer_name, phone, address, channel, notes, created_by)
  VALUES (TRIM(p_customer), TRIM(COALESCE(p_phone, '')), TRIM(COALESCE(p_address, '')),
          p_channel, TRIM(COALESCE(p_notes, '')), p_user);

  SET @new_order_id = LAST_INSERT_ID();
  UPDATE orders SET order_no = CONCAT('ORD-', LPAD(@new_order_id, 5, '0')) WHERE id = @new_order_id;

  SELECT id, order_no FROM orders WHERE id = @new_order_id;
END//

-- Order step 2 (once per line): checks stock, deducts it, writes the audit row, adds to the total
CREATE PROCEDURE sp_order_add_item(
  IN p_order_id BIGINT, IN p_sku VARCHAR(40), IN p_qty INT, IN p_price DECIMAL(8,2), IN p_user VARCHAR(120)
)
BEGIN
  DECLARE v_stock INT DEFAULT NULL;
  DECLARE v_sku VARCHAR(40) DEFAULT UPPER(TRIM(p_sku));

  IF p_qty IS NULL OR p_qty < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantity must be at least 1.';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Price cannot be negative.';
  END IF;

  SELECT stock INTO v_stock FROM products WHERE sku = v_sku FOR UPDATE;

  IF v_stock IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SKU not found.';
  END IF;
  IF v_stock < p_qty THEN
    SET @msg = CONCAT('Not enough stock for ', v_sku, ' (', v_stock, ' left).');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @msg;
  END IF;

  UPDATE products SET stock = stock - p_qty WHERE sku = v_sku;
  INSERT INTO stock_audit_log (sku, old_stock, new_stock, updated_by) VALUES (v_sku, v_stock, v_stock - p_qty, p_user);
  INSERT INTO order_items (order_id, sku, qty, unit_price) VALUES (p_order_id, v_sku, p_qty, p_price);
  UPDATE orders SET total = total + (p_qty * p_price) WHERE id = p_order_id;
END//

-- Status change. Cancelling puts the stock back (and logs it). Cancelled orders are final.
CREATE PROCEDURE sp_order_set_status(IN p_order_id BIGINT, IN p_status VARCHAR(20), IN p_user VARCHAR(120))
BEGIN
  DECLARE v_old VARCHAR(20) DEFAULT NULL;

  IF p_status NOT IN ('New','Packed','Shipped','Delivered','Cancelled') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid order status.';
  END IF;

  SELECT status INTO v_old FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_old IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order not found.';
  END IF;
  IF v_old = 'Cancelled' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancelled orders cannot be changed.';
  END IF;
  IF p_status = 'Cancelled' AND v_old = 'Delivered' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Delivered orders cannot be cancelled.';
  END IF;

  IF p_status = 'Cancelled' THEN
    INSERT INTO stock_audit_log (sku, old_stock, new_stock, updated_by)
    SELECT p.sku, p.stock, p.stock + t.q, p_user
    FROM products p JOIN (SELECT sku, SUM(qty) AS q FROM order_items WHERE order_id = p_order_id GROUP BY sku) t ON t.sku = p.sku;

    UPDATE products p
    JOIN (SELECT sku, SUM(qty) AS q FROM order_items WHERE order_id = p_order_id GROUP BY sku) t ON t.sku = p.sku
    SET p.stock = p.stock + t.q;
  END IF;

  UPDATE orders SET status = p_status WHERE id = p_order_id;
  SELECT id, order_no, status FROM orders WHERE id = p_order_id;
END//

-- resetDemoData(): back to the starting catalogue, no orders, empty audit log
CREATE PROCEDURE sp_reset_demo()
BEGIN
  DELETE FROM order_items;
  DELETE FROM orders;
  DELETE FROM stock_audit_log;
  DELETE FROM products;
  CALL sp_seed_products();
END//

USE lexofrag;

-- System user for public website checkout audit logs
INSERT IGNORE INTO users (email, password, name, role)
VALUES ('website@lexofrag.my', 'SYSTEM_LOCKED', 'Online Storefront', 'Admin');

DELIMITER ;

-- ----------------------------------------------------------------------------
-- 5. QUICK TEST (uncomment to try)
-- ----------------------------------------------------------------------------
-- CALL sp_login('saif@lexofrag.my', 'lexo123');
-- CALL sp_lookup_sku('lf-10c-van');
-- CALL sp_save_stock('LF-10C-VAN', 18, 'saif@lexofrag.my');
-- SELECT * FROM v_inventory_list;
-- CALL sp_order_create('Aina', '012-3456789', 'Taman Senai, Johor', 'TikTok Shop', '', 'saif@lexofrag.my');
-- CALL sp_order_add_item(1, 'LF-10C-VAN', 2, 4.95, 'saif@lexofrag.my');
-- CALL sp_order_set_status(1, 'Cancelled', 'saif@lexofrag.my');
-- CALL sp_reset_demo();
