# Assignment 1: Fulfillment System Design

---

## 1. Assumptions

**Traffic**
- 2,000,000 orders/day = ~23 orders/second average
- Peak: 200,000 orders/minute = ~3,334 orders/second
- Peak lasts up to 2 hours (flash sales, 11.11 events)
- Read:write ratio ~8:1 (ops dashboards, tracking queries dominate)

**Business**
- Marketplaces: Shopee, Lazada, TikTok Shop, own storefront (different webhook formats per source)
- Warehouses: 3-20 warehouses across regions (Thailand-scale assumption; design holds for larger)
- Carriers: 5-15 carriers with REST/SOAP/FTP integration methods
- Order lifecycle: `received -> validated -> allocated -> picked -> packed -> shipped -> in_transit -> delivered`
- Cancellations and returns are in scope but handled by separate services (not designed here)
- No real-time inventory sync with carriers required at ingestion time
- SLA: order ingestion P99 < 1s; warehouse routing < 5s; carrier label creation < 30s

**Consistency**
- Order creation: strongly consistent (no duplicate orders)
- Inventory reservation: optimistic with eventual reconciliation acceptable
- Tracking status: eventually consistent (delays of seconds acceptable)

**Infra**
- Cloud-native (AWS or GCP)
- Multi-AZ within one region; multi-region optional in v2
- Services are containerized, horizontally scalable

---

## 2. High-Level Architecture

```
[Marketplaces / Channels]
        |
        | webhooks / polling
        v
[API Gateway + Rate Limiter]
        |
        v
[Channel Adapters]  <-- normalize per-source format to canonical Order schema
        |
        v
[Order Ingestion Service]  <-- idempotency check, dedup, validation
        |
        v
[Kafka: orders.received topic]
        |
     +--+-------------------------------+
     |                                  |
     v                                  v
[Order Routing Service]         [Audit / Event Log]
  - warehouse selection
  - carrier pre-selection
     |
     v
[Kafka: orders.routed topic]
     |
     v
[Fulfillment Service]
  - WMS instruction
  - pick/pack workflow
     |
     +-----> [Inventory Service] (reserve stock)
     |
     v
[Carrier Integration Service]
  - create shipment
  - generate label
     |
     v
[Kafka: shipments.created topic]
     |
     +-----> [Tracking Service]  <-- polls carrier APIs, ingests webhooks
     |
     +-----> [Notification Service]  <-- push status to marketplace, customer
     |
     v
[Read Model (CQRS)]
     |
     v
[Ops Dashboard API]  <-- search, filter, drill-down for fulfillment teams
```

**Data flow summary**: Inbound order normalized by Channel Adapter -> Ingestion Service validates + deduplicates -> Kafka fans out to Routing and Audit -> Routing assigns warehouse + carrier -> Fulfillment Service orchestrates pick/pack -> Carrier Service creates label -> Tracking Service monitors transit -> Ops Dashboard reads from denormalized read store.

---

## 3. Core Services

### Channel Adapter Service
- One adapter per marketplace (plugin pattern; each implements `ChannelAdapter` interface)
- Normalizes payload to canonical `Order` schema
- Handles auth (OAuth tokens, HMAC webhook verification) per channel
- Stateless; scales horizontally per channel volume

### Order Ingestion Service
- Validates canonical order (required fields, address format, item availability constraints)
- Idempotency key = `marketplace_id + external_order_id`; dedup via Redis SET NX with 24h TTL
- Publishes to `orders.received` Kafka topic (key = order_id for partition locality)
- Returns 202 Accepted; downstream is async

### Order Routing Service
- Consumes `orders.received`
- Selects warehouse: nearest warehouse with available stock (prefers proximity + stock level)
- Pre-selects carrier candidates based on destination, weight, SLA deadline
- Publishes to `orders.routed`

### Inventory Service
- Manages `qty_available`, `qty_reserved`, `qty_committed` per (warehouse, SKU)
- Reservation uses optimistic locking (compare-and-swap on version field in Postgres)
- Publishes `inventory.reserved` or `inventory.insufficient` events
- Cache hot SKUs in Redis with write-through

### Fulfillment Service
- Consumes `orders.routed` + `inventory.reserved`
- Creates WMS pick task, tracks pick -> pack -> ready-to-ship state machine
- Idempotent state transitions (events are the source of truth)

### Carrier Integration Service
- Adapter pattern per carrier (REST, SOAP, FTP normalized behind `CarrierAdapter` interface)
- Creates shipment, generates label PDF/ZPL
- Handles carrier-specific rate shopping at label creation
- Circuit breaker per carrier; failover to secondary carrier if primary unavailable

### Tracking Service
- Polls carrier APIs on configurable intervals (or ingests push webhooks)
- Normalizes tracking events to canonical status enum
- Publishes to `tracking.updated` topic
- Stores in append-only event store (Postgres or Cassandra for high write volume)

### Notification Service
- Consumes `tracking.updated`, `shipments.created`
- Pushes status back to source marketplace and/or customer (email/SMS)
- Outbox pattern to guarantee at-least-once delivery

### Ops Dashboard API
- Read-only GraphQL/REST API backed by Elasticsearch read model
- Supports: full-text order search, filter by status/warehouse/carrier/date, exception drill-down
- CQRS: write path does not touch this service; updated via Kafka consumer projecting into ES

---

## 4. Main Data Model

```sql
-- Core transactional tables (PostgreSQL)

orders
  id              UUID PRIMARY KEY
  external_id     VARCHAR NOT NULL         -- marketplace's order ID
  marketplace_id  VARCHAR NOT NULL
  channel_id      VARCHAR NOT NULL
  status          VARCHAR NOT NULL         -- enum: received|allocated|picking|packed|shipped|delivered
  warehouse_id    UUID REFERENCES warehouses(id)
  carrier_id      UUID REFERENCES carriers(id)
  shipping_address JSONB NOT NULL
  total_weight_kg NUMERIC(8,3)
  declared_value  NUMERIC(12,2)
  sla_deadline    TIMESTAMPTZ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  UNIQUE(marketplace_id, external_id)

order_items
  id          UUID PRIMARY KEY
  order_id    UUID REFERENCES orders(id)
  sku         VARCHAR NOT NULL
  name        VARCHAR
  qty         INT NOT NULL
  unit_weight_kg NUMERIC(8,3)

shipments
  id              UUID PRIMARY KEY
  order_id        UUID REFERENCES orders(id)
  carrier_id      UUID REFERENCES carriers(id)
  tracking_number VARCHAR
  label_url       VARCHAR
  status          VARCHAR NOT NULL         -- enum: created|in_transit|delivered|exception
  shipped_at      TIMESTAMPTZ
  delivered_at    TIMESTAMPTZ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

warehouses
  id          UUID PRIMARY KEY
  name        VARCHAR NOT NULL
  region      VARCHAR NOT NULL
  province    VARCHAR
  is_active   BOOLEAN DEFAULT TRUE

inventory
  warehouse_id    UUID REFERENCES warehouses(id)
  sku             VARCHAR NOT NULL
  qty_available   INT NOT NULL DEFAULT 0
  qty_reserved    INT NOT NULL DEFAULT 0
  version         INT NOT NULL DEFAULT 0   -- optimistic lock
  PRIMARY KEY(warehouse_id, sku)

carriers
  id              UUID PRIMARY KEY
  name            VARCHAR NOT NULL
  adapter_type    VARCHAR NOT NULL         -- 'rest'|'soap'|'ftp'
  config          JSONB                    -- credentials, endpoints (encrypted at rest)
  supported_regions VARCHAR[]
  is_active       BOOLEAN DEFAULT TRUE

fulfillment_events
  id          UUID PRIMARY KEY
  order_id    UUID NOT NULL               -- indexed; no FK for append-only perf
  event_type  VARCHAR NOT NULL
  payload     JSONB
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- partition by occurred_at monthly
```

**Read model** (Elasticsearch index `orders_ops`): denormalized document combining order + latest shipment + tracking status + warehouse/carrier names. Updated by Kafka consumer on every state change. Used exclusively by Ops Dashboard API.

---

## 5. Technology Choices

| Component | Choice | Reason |
|---|---|---|
| Message broker | **Kafka** | 200K/min peak requires durable, ordered, replayable queue; partition by order_id ensures per-order ordering |
| Primary DB | **PostgreSQL** | ACID for inventory reservation + order dedup; row-level locking; mature ecosystem |
| Cache / dedup | **Redis** | SET NX for idempotency keys; hot inventory caching; distributed locks |
| Search / ops visibility | **Elasticsearch** | Full-text + filter across millions of orders; denormalized read model handles complex dashboard queries |
| Container orchestration | **Kubernetes** | Horizontal autoscaling of stateless services; HPA on Kafka consumer lag metric |
| Service mesh | **Istio or AWS App Mesh** | Circuit breakers, retries, mTLS between services |
| Monitoring | **Prometheus + Grafana + PagerDuty** | Kafka consumer lag, order processing P99, error rates per carrier |
| Language | **TypeScript / Node.js** | Fast async I/O suits event-driven architecture; large ecosystem for carrier/marketplace SDKs |
| Internal RPC | **gRPC** | Lower latency than REST for synchronous inter-service calls (inventory check, routing) |

---

## 6. Trade-offs

**Kafka over AWS SQS/SNS**
- More operational overhead (cluster management, topic configuration)
- Gains: message ordering per partition, consumer group replay for backfill, much higher throughput at lower cost at scale
- Decision: Kafka at 200K/min makes managed Kafka (Confluent Cloud / MSK) cost-justified

**PostgreSQL over DynamoDB for orders + inventory**
- DynamoDB scales better horizontally; Postgres harder to shard
- Chose Postgres: inventory reservation needs ACID (double-reservation causes oversell); order dedup needs unique constraint; complex queries on ops dashboard are easier
- Mitigation: read replicas for dashboard; vertical scale to r6g.4xlarge handles ~10K TPS comfortably; shard by warehouse_id in v2 if needed

**Eventual consistency for inventory vs strong consistency**
- Strong consistency at 3,334 orders/second with distributed inventory would require distributed locking that serializes writes -> bottleneck
- Chose optimistic locking with reconciliation: reserve optimistically, reconcile mismatches via background job; oversell risk is low (~0.01%) and handled by business process (backorder / cancel)

**Async carrier label creation vs sync**
- Sync: simpler, but carrier API latency (500ms-5s) would block order pipeline
- Chose async: order processing pipeline never blocked by carrier; label created as background task; ops dashboard shows `pending_label` status with SLA alert if not resolved in 10 min

**CQRS for ops dashboard**
- Adds complexity (separate read model, eventual consistency on dashboard)
- Eliminates expensive analytical queries on transactional Postgres; dashboard never competes with order ingestion for DB resources

---

## 7. Scaling Plan

**Phase 1 (current design, up to ~5K orders/second)**
- Kafka: 20 partitions on `orders.received`, 10 partitions on downstream topics
- Ingestion Service: 20 replicas (horizontal)
- Postgres: r6g.4xlarge primary + 2 read replicas
- Redis: ElastiCache cluster mode, 6 shards
- Elasticsearch: 3-node cluster, 2 shards per index

**Phase 2 (5K-50K orders/second)**
- Shard `orders` table by `(marketplace_id % N)` using Citus or migrate to sharded Postgres
- Shard `inventory` table by `warehouse_id`
- Increase Kafka partitions to 200; scale consumer groups proportionally
- Separate `fulfillment_events` into Cassandra (append-only, time-series query pattern)
- Introduce L7 read cache (Redis) in front of Ops Dashboard API for repeated queries

**Phase 3 (multi-region)**
- Deploy full stack in 2+ regions (e.g., Thailand + Singapore)
- Route orders to nearest region at API Gateway
- Cross-region inventory read replica for routing decisions
- Global Kafka (Confluent Global Replication) for cross-region event propagation

**Operational visibility scaling**
- Elasticsearch index lifecycle: hot (7 days) -> warm (30 days) -> cold/delete (90 days)
- Real-time SLA monitoring: Kafka Streams job counts orders stuck in state > threshold -> PagerDuty alert
- Carrier performance dashboard: daily rollup materialized view per carrier+region

**Key metrics to monitor at scale**
- Kafka consumer lag per topic (alert if > 10K messages)
- Order ingestion P99 latency
- Inventory reservation conflict rate
- Carrier API error rate + P99 latency per carrier
- Orders in exception state (stuck > 15 min in any non-terminal state)
