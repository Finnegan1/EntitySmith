# EntitySmith Test Data

This fixture set is designed for the current EntitySmith app, not the old Electron prototype.
It gives you realistic structured sources that exercise:

- declared foreign keys from a SQLite operational database
- cross-source proposal generation from shared IDs, emails, SKUs, and order references
- nullable fields, mixed value distributions, and repeated categories for profiling
- source entities that should eventually consolidate into canonical graph types like Customer, Product, Order, Shipment, Lead, and Refund

## Recommended import set

1. `commerce_core.db`
2. `crm_contacts.csv`
3. `warehouse_shipments.json`
4. `marketing_leads.json`
5. `refund_cases.csv`

## What each source is for

- `commerce_core.db`: transactional source of truth with declared FKs between customers, orders, order_items, products, and support_tickets
- `crm_contacts.csv`: sales CRM contacts that overlap with customers through `linked_customer_id` and email
- `warehouse_shipments.json`: fulfillment records linking to orders, customers, and products via `sales_order_id`, `customer_ref`, and `sku`
- `marketing_leads.json`: top-of-funnel leads with some converted customers and product interest signals
- `refund_cases.csv`: finance and support style dataset referencing orders and customers

## Expected proposal hotspots

- `orders.customer_id` -> `customers.customer_id`
- `order_items.order_id` -> `orders.order_id`
- `order_items.product_id` -> `products.product_id`
- `support_tickets.customer_id` -> `customers.customer_id`
- `support_tickets.order_id` -> `orders.order_id`
- `crm_contacts.linked_customer_id` -> `customers.customer_id`
- `warehouse_shipments.sales_order_id` -> `orders.order_id`
- `warehouse_shipments.customer_ref` -> `customers.customer_id`
- `warehouse_shipments.sku` -> `products.sku`
- `marketing_leads.converted_customer_id` -> `customers.customer_id`
- `marketing_leads.interest_sku` -> `products.sku`
- `refund_cases.order_id` -> `orders.order_id`
- `refund_cases.customer_id` -> `customers.customer_id`

## Notes

- The JSON files use root-object envelope formats on purpose so you can test EntitySmith's JSON envelope parsing.
- Some rows are incomplete or messy by design: null phone numbers, unresolved tickets, unconverted leads, partial refunds, and inconsistent naming between systems.
