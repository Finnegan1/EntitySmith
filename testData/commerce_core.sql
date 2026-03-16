PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  customer_id TEXT PRIMARY KEY,
  external_crm_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  country_code TEXT NOT NULL,
  segment TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE products (
  product_id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT NOT NULL,
  unit_price REAL NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  ordered_at TEXT NOT NULL,
  status TEXT NOT NULL,
  sales_channel TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_amount REAL NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE order_items (
  order_item_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE support_tickets (
  ticket_id TEXT PRIMARY KEY,
  customer_id TEXT,
  order_id TEXT,
  ticket_type TEXT NOT NULL,
  priority TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  csat_score INTEGER,
  summary TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

INSERT INTO customers (
  customer_id, external_crm_id, full_name, email, phone, country_code, segment, created_at
) VALUES
  ('CUST-1001', 'CRM-204', 'Maya Patel', 'maya.patel@alderaerospace.com', '+1-206-555-0142', 'US', 'enterprise', '2024-01-12T10:15:00Z'),
  ('CUST-1002', 'CRM-205', 'Jonas Meyer', 'jonas.meyer@northgrid.io', '+49-30-555-0199', 'DE', 'mid_market', '2024-02-03T09:02:00Z'),
  ('CUST-1003', 'CRM-206', 'Elena Rossi', 'elena.rossi@solis-logistics.eu', NULL, 'IT', 'mid_market', '2024-02-18T14:41:00Z'),
  ('CUST-1004', 'CRM-207', 'Naomi Chen', 'naomi.chen@novaretail.sg', '+65-6400-8821', 'SG', 'enterprise', '2024-03-11T08:24:00Z'),
  ('CUST-1005', 'CRM-208', 'Daniel Brooks', 'daniel.brooks@ridgehealth.org', '+1-617-555-0107', 'US', 'enterprise', '2024-03-19T16:09:00Z'),
  ('CUST-1006', NULL, 'Priya Nair', 'priya.nair@lumenfoods.co.uk', '+44-20-5550-1103', 'GB', 'smb', '2024-04-02T12:32:00Z'),
  ('CUST-1007', 'CRM-210', 'Lucas Ferreira', 'lucas.ferreira@verdeenergia.com.br', NULL, 'BR', 'mid_market', '2024-04-27T11:48:00Z'),
  ('CUST-1008', NULL, 'Amelia Hart', 'amelia.hart@indigoadvisors.com', '+1-415-555-0136', 'US', 'smb', '2024-05-06T13:55:00Z');

INSERT INTO products (
  product_id, sku, product_name, category, brand, unit_price, status
) VALUES
  ('PROD-001', 'AERO-SEN-01', 'Atmospheric Sensor Kit', 'sensors', 'Alder Labs', 899.00, 'active'),
  ('PROD-002', 'GRID-GW-02', 'Industrial Grid Gateway', 'gateways', 'NorthGrid', 1299.00, 'active'),
  ('PROD-003', 'SOL-EDGE-07', 'Solar Edge Controller', 'controllers', 'Solis', 649.00, 'active'),
  ('PROD-004', 'RETL-POS-09', 'Retail POS Edge Node', 'edge_devices', 'Nova Retail', 1499.00, 'active'),
  ('PROD-005', 'HLTH-IOT-03', 'Clinical IoT Bridge', 'gateways', 'Ridge Health', 1799.00, 'active'),
  ('PROD-006', 'FOOD-COLD-11', 'Cold Chain Monitor', 'sensors', 'Lumen Foods', 459.00, 'active'),
  ('PROD-007', 'CONS-ANL-01', 'Sustainability Analytics Seat', 'software', 'Verde Analytics', 299.00, 'trial');

INSERT INTO orders (
  order_id, customer_id, ordered_at, status, sales_channel, currency, total_amount
) VALUES
  ('ORD-5001', 'CUST-1001', '2025-01-09T15:22:00Z', 'fulfilled', 'direct_sales', 'USD', 2597.00),
  ('ORD-5002', 'CUST-1002', '2025-01-13T10:05:00Z', 'fulfilled', 'partner', 'EUR', 1299.00),
  ('ORD-5003', 'CUST-1003', '2025-01-20T08:49:00Z', 'refunded', 'direct_sales', 'EUR', 649.00),
  ('ORD-5004', 'CUST-1004', '2025-01-25T18:11:00Z', 'fulfilled', 'field_team', 'SGD', 2998.00),
  ('ORD-5005', 'CUST-1005', '2025-02-04T13:30:00Z', 'partially_refunded', 'direct_sales', 'USD', 3598.00),
  ('ORD-5006', 'CUST-1001', '2025-02-18T09:44:00Z', 'fulfilled', 'renewal', 'USD', 598.00),
  ('ORD-5007', 'CUST-1006', '2025-03-02T16:02:00Z', 'pending_shipment', 'self_serve', 'GBP', 918.00),
  ('ORD-5008', 'CUST-1007', '2025-03-11T11:26:00Z', 'fulfilled', 'partner', 'BRL', 299.00),
  ('ORD-5009', 'CUST-1008', '2025-03-15T07:57:00Z', 'canceled', 'self_serve', 'USD', 1499.00);

INSERT INTO order_items (
  order_item_id, order_id, product_id, quantity, unit_price, discount_pct
) VALUES
  ('ITEM-9001', 'ORD-5001', 'PROD-001', 1, 899.00, 0),
  ('ITEM-9002', 'ORD-5001', 'PROD-002', 1, 1299.00, 0),
  ('ITEM-9003', 'ORD-5001', 'PROD-007', 2, 199.50, 0),
  ('ITEM-9004', 'ORD-5002', 'PROD-002', 1, 1299.00, 0),
  ('ITEM-9005', 'ORD-5003', 'PROD-003', 1, 649.00, 0),
  ('ITEM-9006', 'ORD-5004', 'PROD-004', 2, 1499.00, 0),
  ('ITEM-9007', 'ORD-5005', 'PROD-005', 2, 1799.00, 0),
  ('ITEM-9008', 'ORD-5006', 'PROD-007', 2, 299.00, 0),
  ('ITEM-9009', 'ORD-5007', 'PROD-006', 2, 459.00, 0),
  ('ITEM-9010', 'ORD-5008', 'PROD-007', 1, 299.00, 0),
  ('ITEM-9011', 'ORD-5009', 'PROD-004', 1, 1499.00, 0);

INSERT INTO support_tickets (
  ticket_id, customer_id, order_id, ticket_type, priority, opened_at, resolved_at, csat_score, summary
) VALUES
  ('TICK-3001', 'CUST-1001', 'ORD-5001', 'installation', 'medium', '2025-01-12T09:10:00Z', '2025-01-14T16:45:00Z', 5, 'Needed help pairing the atmospheric sensor kit with the gateway.'),
  ('TICK-3002', 'CUST-1003', 'ORD-5003', 'refund_request', 'high', '2025-01-22T13:01:00Z', '2025-01-24T10:18:00Z', 3, 'Controller did not match the existing solar edge enclosure.'),
  ('TICK-3003', 'CUST-1005', 'ORD-5005', 'damaged_unit', 'urgent', '2025-02-06T07:34:00Z', NULL, NULL, 'One of the clinical IoT bridges arrived with a cracked mounting bracket.'),
  ('TICK-3004', 'CUST-1006', 'ORD-5007', 'shipping_delay', 'medium', '2025-03-05T11:42:00Z', NULL, NULL, 'Cold chain monitor order has not reached the carrier handoff stage.'),
  ('TICK-3005', 'CUST-1008', 'ORD-5009', 'cancellation', 'low', '2025-03-15T10:27:00Z', '2025-03-15T12:02:00Z', 4, 'Customer canceled before payment capture.'),
  ('TICK-3006', NULL, NULL, 'general_question', 'low', '2025-03-16T08:15:00Z', '2025-03-16T09:00:00Z', 5, 'Prospective buyer asked about software seat minimums.');
