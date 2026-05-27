# Senior Software Engineer Interview Assignment

**Candidate submission - Logistics & Fulfillment Platform**

---

## Contents

| File | Description |
|---|---|
| `assignment-1.md` | Fulfillment System Design document |
| `assignment-2.md` | AI-Powered Feature design and explanation |
| `ai-demo/` | TypeScript implementation of Smart Carrier Selection |
| `assets/diagrams/` | Architecture diagrams (referenced in assignment-1.md) |

---

## Assignment 1: Fulfillment System Design

See [`assignment-1.md`](assignment-1.md).

Covers: Assumptions, High-Level Architecture, Core Services, Main Data Model, Technology Choices, Trade-offs, Scaling Plan.

Scale target: 2M orders/day, 200K orders/minute peak.

---

## Assignment 2: AI-Powered Feature - Smart Carrier Selection

See [`assignment-2.md`](assignment-2.md) for design and explanation.

See [`ai-demo/`](ai-demo/) for TypeScript implementation.

### Run the demo

```bash
cd ai-demo
npm install

# Without AI (uses rule-based fallback, no API key needed):
npm start

# With real Claude AI:
ANTHROPIC_API_KEY=your_key_here npm start

# Run tests:
npm test
```

### What the demo shows

Two realistic scenarios for a Thai e-commerce fulfillment platform:

1. **Fragile item + COD required, Chiang Mai, 2-day SLA** - demonstrates fragile item handling, COD filtering, SLA constraint
2. **Heavy 15kg item, cost-sensitive, Bangkok, 5-day SLA** - demonstrates weight handling, economy selection

The system uses real Claude (claude-sonnet-4-6) when an API key is provided. Without a key, it falls back to a rule-based selection engine transparently.

---

## Time spent

- Assignment 1 design: ~2 hours
- Assignment 2 design + TypeScript implementation: ~2.5 hours
- Total: ~4.5 hours
