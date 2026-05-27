# Smart Carrier Selection - AI Demo

AI-powered carrier recommendation for a fulfillment platform.

## Requirements

- Node.js 18+
- npm

## Setup

```bash
cd ai-demo
npm install
```

## Run

**Without AI (rule-based fallback):**
```bash
npm start
```

**With real AI (Anthropic Claude):**
```bash
ANTHROPIC_API_KEY=your_key_here npm start
```

When `ANTHROPIC_API_KEY` is not set, the demo automatically uses the rule-based fallback and clearly labels the output as `Source: FALLBACK`.

## Run Tests

```bash
npm test
```

## Project Structure

```
src/
  index.ts        - Entry point, runs two demo scenarios
  types.ts        - All TypeScript interfaces
  sample-data.ts  - Sample carriers and order inputs
  prompt.ts       - Builds the AI prompt from structured input
  ai-client.ts    - Anthropic API call + response parsing + validation
  validate.ts     - Input validation
  fallback.ts     - Rule-based fallback (used when AI unavailable)
tests/
  ai-demo.test.ts - Unit tests for validation, fallback, prompt
```

## Demo Scenarios

1. **Fragile item + COD, tight SLA, Chiang Mai** - Tests COD filtering, fragile item priority, SLA constraint
2. **Heavy item, cost-sensitive, Bangkok** - Tests weight handling, cost optimization

## Notes

- Mock output is produced by the rule-based fallback when no API key is set
- The AI prompt filters ineligible carriers before sending to Claude (weight, COD, province coverage)
- If AI returns invalid JSON or an ineligible carrier, the system falls back automatically
- Prompt caching is enabled on the system prompt to reduce latency and cost on repeated calls
