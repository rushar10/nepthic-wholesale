/* Nepthic Wholesale database. Belongs to wholesale.nepthic.com only: no other site reads or
   writes it. Products are a local copy of the Clothing catalogue (imported on a schedule,
   see core/catalogue-import.ts), so Wholesale keeps working when the Clothing site is down.
   Money is stored in integer cents (AUD). */
import { randomUUID } from "node:crypto";
import { relations, sql } from "drizzle-orm";
import { boolean, customType, index, integer, jsonb, pgEnum, pgTable, serial, real, text, timestamp, uniqueIndex , primaryKey } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/* BUSINESS buys; STAFF prices quotes and ships; ADMIN also approves accounts and returns and changes settings. */
export const role = pgEnum("role", ["BUSINESS", "STAFF", "ADMIN"]);
export const businessStatus = pgEnum("business_status", ["PENDING", "APPROVED", "REJECTED"]);
export const paymentMode = pgEnum("payment_mode", ["FULL", "DEPOSIT"]);
export const quoteType = pgEnum("quote_type", ["QUOTE", "ENQUIRY"]);
export const quoteStatus = pgEnum("quote_status", ["REQUESTED", "QUOTED", "ANSWERED", "DECLINED", "CONVERTED"]);
export const orderStatus = pgEnum("order_status", ["AWAITING_PAYMENT", "DEPOSIT_PAID", "BALANCE_REQUESTED", "PAID", "CANCELLED"]);
export const fulfilmentStatus = pgEnum("fulfilment_status", ["UNFULFILLED", "IN_PRODUCTION", "SHIPPED", "DELIVERED"]);
export const paymentKind = pgEnum("payment_kind", ["FULL", "DEPOSIT", "BALANCE", "REFUND"]);
export const paymentStatus = pgEnum("payment_status", ["PENDING", "SUCCEEDED", "FAILED"]);
export const returnStatus = pgEnum("return_status", ["PENDING", "APPROVED", "REJECTED", "COMPLETED"]);
export const importStatus = pgEnum("import_status", ["RUNNING", "SUCCEEDED", "FAILED"]);

export type Role = (typeof role.enumValues)[number];
export type PaymentMode = (typeof paymentMode.enumValues)[number];
export type PaymentKind = (typeof paymentKind.enumValues)[number];

export const businesses = pgTable("businesses", {
  id: id(),
  legalName: text("legal_name").notNull(),
  tradingName: text("trading_name").notNull(),
  abn: text("abn").notNull().unique(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postcode: text("postcode").notNull(),
  status: businessStatus("status").notNull().default("PENDING"),
  paymentModeOverride: paymentMode("payment_mode_override"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: role("role").notNull().default("BUSINESS"),
  businessId: text("business_id").references(() => businesses.id),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const products = pgTable("products", {
  id: id(),
  /** The Clothing catalogue's id for this product; null for wholesale-only products. */
  sourceId: text("source_id").unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(), // RRP, copied from the Clothing catalogue
  hue: integer("hue").notNull().default(250), // placeholder artwork colour until images are linked
  imageUrl: text("image_url"),
  wholesaleEnabled: boolean("wholesale_enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  syncedAt: ts("synced_at"), // last time the import confirmed this product
  archivedAt: ts("archived_at"), // gone from the Clothing feed; hidden but kept for past orders
  createdAt: createdAt(),
});

export const variants = pgTable("variants", {
  id: id(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  size: text("size").notNull(),
  sku: text("sku").notNull().unique(),
  stock: integer("stock").notNull().default(0), // wholesale allocation, managed here, never overwritten by the import
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("variants_product_size").on(t.productId, t.size)]);

export const catalogueImports = pgTable("catalogue_imports", {
  id: id(),
  source: text("source").notNull(),
  trigger: text("trigger").notNull(), // "schedule" | "admin" | "cli"
  status: importStatus("status").notNull().default("RUNNING"),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  archived: integer("archived").notNull().default(0),
  error: text("error"),
  startedAt: createdAt(),
  finishedAt: ts("finished_at"),
});

export const priceTiers = pgTable("price_tiers", {
  id: id(),
  minUnits: integer("min_units").notNull(),
  maxUnits: integer("max_units"),
  discountPct: integer("discount_pct").notNull(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  moqPerStyle: integer("moq_per_style").notNull().default(24),
  paymentMode: paymentMode("payment_mode").notNull().default("DEPOSIT"),
  depositPct: integer("deposit_pct").notNull().default(30),
  balanceDueDays: integer("balance_due_days").notNull().default(14),
  quoteValidDays: integer("quote_valid_days").notNull().default(14),
  proximityRadius: integer("proximity_radius").notNull().default(150),
  proximityIntensity: real("proximity_intensity").notNull().default(0.85),
  proximityEnabled: boolean("proximity_enabled").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: id(),
  number: serial("number").notNull().unique(),
  businessId: text("business_id").references(() => businesses.id),
  userId: text("user_id").notNull().references(() => users.id),
  status: orderStatus("status").notNull().default("AWAITING_PAYMENT"),
  fulfilment: fulfilmentStatus("fulfilment").notNull().default("UNFULFILLED"),
  paymentMode: paymentMode("payment_mode").notNull(),
  depositPct: integer("deposit_pct").notNull().default(0),
  tierDiscountPct: integer("tier_discount_pct").notNull().default(0),
  subtotalCents: integer("subtotal_cents").notNull(), // ex GST
  gstCents: integer("gst_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  paidCents: integer("paid_cents").notNull().default(0),
  refundedCents: integer("refunded_cents").notNull().default(0),
  balanceDueAt: ts("balance_due_at"),
  stockDeducted: boolean("stock_deducted").notNull().default(false),
  createdAt: createdAt(),
});

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  variantId: text("variant_id").references(() => variants.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(), // ex GST
});

export const quotes = pgTable("quotes", {
  id: id(),
  number: serial("number").notNull().unique(),
  type: quoteType("type").notNull(),
  businessId: text("business_id").notNull().references(() => businesses.id),
  userId: text("user_id").notNull().references(() => users.id),
  itemsText: text("items_text").notNull(),
  estimatedUnits: integer("estimated_units").notNull().default(0),
  neededBy: ts("needed_by"),
  message: text("message").notNull().default(""),
  status: quoteStatus("status").notNull().default("REQUESTED"),
  amountCents: integer("amount_cents"), // quoted total inc GST
  paymentMode: paymentMode("payment_mode"), // null = business/global default at acceptance
  reply: text("reply"),
  respondedAt: ts("responded_at"),
  expiresAt: ts("expires_at"),
  orderId: text("order_id").unique().references(() => orders.id),
  createdAt: createdAt(),
});

export const payments = pgTable("payments", {
  id: id(),
  kind: paymentKind("kind").notNull(),
  status: paymentStatus("status").notNull().default("PENDING"),
  amountCents: integer("amount_cents").notNull(), // negative for refunds
  description: text("description").notNull(),
  orderId: text("order_id").references(() => orders.id),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeRefundId: text("stripe_refund_id"),
  refundOfId: text("refund_of_id"),
  paidAt: ts("paid_at"),
  createdAt: createdAt(),
}, (t) => [index("payments_order_idx").on(t.orderId)]);

export const uploads = pgTable("uploads", {
  id: id(),
  userId: text("user_id"),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

export const returnRequests = pgTable("return_requests", {
  id: id(),
  number: serial("number").notNull().unique(),
  orderId: text("order_id").notNull().references(() => orders.id),
  userId: text("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  details: text("details").notNull(),
  units: integer("units").notNull(),
  photoIds: text("photo_ids").array().notNull().default(sql`'{}'::text[]`),
  status: returnStatus("status").notNull().default("PENDING"),
  decisionNote: text("decision_note"),
  reviewedById: text("reviewed_by_id"),
  reviewedAt: ts("reviewed_at"),
  createdAt: createdAt(),
});

export const emailLog = pgTable("email_log", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  data: jsonb("data"),
  createdAt: createdAt(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId)]);

/* relations (for db.query.* with `with`) */
export const businessesRelations = relations(businesses, ({ many }) => ({ users: many(users), quotes: many(quotes), orders: many(orders) }));
export const usersRelations = relations(users, ({ one, many }) => ({
  business: one(businesses, { fields: [users.businessId], references: [businesses.id] }),
  orders: many(orders), quotes: many(quotes),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({ user: one(users, { fields: [sessions.userId], references: [users.id] }) }));
export const productsRelations = relations(products, ({ many }) => ({ variants: many(variants) }));
export const variantsRelations = relations(variants, ({ one }) => ({ product: one(products, { fields: [variants.productId], references: [products.id] }) }));
export const ordersRelations = relations(orders, ({ one, many }) => ({
  business: one(businesses, { fields: [orders.businessId], references: [businesses.id] }),
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems), payments: many(payments), returns: many(returnRequests),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(variants, { fields: [orderItems.variantId], references: [variants.id] }),
}));
export const quotesRelations = relations(quotes, ({ one }) => ({
  business: one(businesses, { fields: [quotes.businessId], references: [businesses.id] }),
  user: one(users, { fields: [quotes.userId], references: [users.id] }),
  order: one(orders, { fields: [quotes.orderId], references: [orders.id] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({ order: one(orders, { fields: [payments.orderId], references: [orders.id] }) }));
export const returnRequestsRelations = relations(returnRequests, ({ one }) => ({
  order: one(orders, { fields: [returnRequests.orderId], references: [orders.id] }),
  user: one(users, { fields: [returnRequests.userId], references: [users.id] }),
}));

/* Things a signed-in person has saved (the heart on a product card). Private to that person. */
export const savedItems = pgTable("saved_items", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.itemId] })]);
