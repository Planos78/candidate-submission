import express from "express";
import { selectCarrier } from "./ai-client";
import { validateInput } from "./validate";
import { SAMPLE_INPUT_FRAGILE_COD, SAMPLE_INPUT_HEAVY_ECONOMY } from "./sample-data";
import { CarrierSelectionInput, CarrierRecommendation } from "./types";

const app = express();
const PORT = 3001;

interface ScenarioResult {
  label: string;
  order: CarrierSelectionInput["order"];
  result: CarrierRecommendation;
  source: string;
  error?: string;
}

async function runScenario(
  input: CarrierSelectionInput,
  label: string
): Promise<ScenarioResult> {
  const validation = validateInput(input);
  if (!validation.valid) {
    return {
      label,
      order: input.order,
      result: {} as CarrierRecommendation,
      source: "error",
      error: validation.errors.map((e) => `${e.field}: ${e.message}`).join(", "),
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { result, source } = await selectCarrier(input, apiKey);
  return { label, order: input.order, result, source };
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "#16a34a";
  if (confidence >= 0.6) return "#d97706";
  return "#dc2626";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "High";
  if (confidence >= 0.6) return "Medium";
  return "Low";
}

function renderScenario(s: ScenarioResult, index: number): string {
  const { label, order, result, source } = s;
  const isAI = source === "ai";
  const conf = result.confidence ?? 0;
  const confPct = Math.round(conf * 100);
  const confColor = confidenceColor(conf);

  const tags = [
    order.fragile ? `<span class="tag tag-warn">Fragile</span>` : "",
    order.requires_cod ? `<span class="tag tag-blue">COD</span>` : "",
    `<span class="tag tag-gray">${order.marketplace}</span>`,
  ]
    .filter(Boolean)
    .join("");

  const riskHtml =
    result.risk_flags?.length > 0
      ? `<div class="risk-box">
          <div class="risk-title">⚠ Risk Flags</div>
          ${result.risk_flags.map((f) => `<div class="risk-item">${f}</div>`).join("")}
        </div>`
      : "";

  const altHtml =
    result.alternatives?.length > 0
      ? `<div class="alt-section">
          <div class="section-label">Alternatives Considered</div>
          ${result.alternatives
            .map(
              (a) => `
            <div class="alt-row">
              <div class="alt-name">${a.carrier_name}</div>
              <div class="alt-cost">${a.estimated_cost_thb} THB</div>
              <div class="alt-tradeoff">${a.trade_off}</div>
            </div>`
            )
            .join("")}
        </div>`
      : "";

  const deadline = new Date(order.required_delivery_by);
  const now = new Date();
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return `
    <div class="card">
      <div class="card-header">
        <div class="scenario-num">Scenario ${index + 1}</div>
        <div class="scenario-label">${label}</div>
        <div class="source-badge ${isAI ? "source-ai" : "source-fallback"}">
          ${isAI ? "🤖 Claude AI" : "⚙ Rule-based Fallback"}
        </div>
      </div>

      <div class="order-grid">
        <div class="order-item">
          <div class="order-key">Order ID</div>
          <div class="order-val">${order.id}</div>
        </div>
        <div class="order-item">
          <div class="order-key">Destination</div>
          <div class="order-val">${order.destination.province} ${order.destination.postcode}</div>
        </div>
        <div class="order-item">
          <div class="order-key">Weight</div>
          <div class="order-val">${order.weight_kg} kg</div>
        </div>
        <div class="order-item">
          <div class="order-key">Declared Value</div>
          <div class="order-val">${order.declared_value_thb.toLocaleString()} THB</div>
        </div>
        <div class="order-item">
          <div class="order-key">SLA Deadline</div>
          <div class="order-val">${daysLeft} days left</div>
        </div>
        <div class="order-item">
          <div class="order-key">Flags</div>
          <div class="order-val">${tags || "—"}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="rec-header">
        <div class="rec-left">
          <div class="section-label">Recommended Carrier</div>
          <div class="carrier-name">${result.carrier_name}</div>
          <div class="carrier-meta">
            <span class="meta-pill">${result.estimated_cost_thb} THB</span>
            <span class="meta-pill">${result.estimated_delivery_days} days delivery</span>
          </div>
        </div>
        <div class="conf-circle" style="border-color: ${confColor}; color: ${confColor}">
          <div class="conf-pct">${confPct}%</div>
          <div class="conf-label">${confidenceLabel(conf)}</div>
        </div>
      </div>

      <div class="reasoning-box">
        <div class="section-label">AI Reasoning</div>
        <div class="reasoning-text">${result.reasoning}</div>
      </div>

      ${riskHtml}
      ${altHtml}
    </div>
  `;
}

function renderPage(scenarios: ScenarioResult[], apiKeyPresent: boolean): string {
  const scenarioHtml = scenarios.map((s, i) => renderScenario(s, i)).join("");
  const aiMode = apiKeyPresent
    ? `<div class="mode-badge mode-ai">🤖 Claude AI Active (${process.env.ANTHROPIC_API_KEY?.slice(0, 10)}...)</div>`
    : `<div class="mode-badge mode-fallback">⚙ No API Key — Rule-based Fallback Mode<br><small>Set ANTHROPIC_API_KEY to enable Claude AI</small></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Smart Carrier Selection — Demo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f1f5f9;
      color: #1e293b;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .page-header {
      max-width: 900px;
      margin: 0 auto 32px;
    }
    .page-title {
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
    }
    .page-sub {
      font-size: 15px;
      color: #64748b;
      margin-top: 6px;
    }
    .mode-badge {
      display: inline-block;
      margin-top: 14px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.5;
    }
    .mode-ai { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .mode-fallback { background: #fef9c3; color: #854d0e; border: 1px solid #fde68a; }

    .cards { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }

    .card {
      background: #fff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      padding: 28px;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .scenario-num {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #6366f1;
      background: #eef2ff;
      padding: 3px 10px;
      border-radius: 99px;
    }
    .scenario-label {
      font-size: 17px;
      font-weight: 600;
      color: #0f172a;
      flex: 1;
    }
    .source-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 99px;
    }
    .source-ai { background: #dcfce7; color: #166534; }
    .source-fallback { background: #f1f5f9; color: #475569; }

    .order-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .order-item {
      background: #f8fafc;
      border-radius: 10px;
      padding: 12px;
    }
    .order-key { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    .order-val { font-size: 14px; font-weight: 600; color: #1e293b; }

    .tag {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 99px;
      margin-right: 4px;
    }
    .tag-warn { background: #fef3c7; color: #92400e; }
    .tag-blue { background: #dbeafe; color: #1e40af; }
    .tag-gray { background: #f1f5f9; color: #475569; }

    .divider { height: 1px; background: #f1f5f9; margin: 20px 0; }

    .rec-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #94a3b8; margin-bottom: 8px; }
    .carrier-name { font-size: 22px; font-weight: 700; color: #0f172a; }
    .carrier-meta { display: flex; gap: 8px; margin-top: 8px; }
    .meta-pill {
      font-size: 13px; font-weight: 600;
      background: #f1f5f9; color: #475569;
      padding: 4px 12px; border-radius: 99px;
    }

    .conf-circle {
      width: 80px; height: 80px;
      border-radius: 50%;
      border: 4px solid;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .conf-pct { font-size: 20px; font-weight: 700; line-height: 1; }
    .conf-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }

    .reasoning-box {
      background: #f8fafc;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .reasoning-text { font-size: 14px; color: #334155; line-height: 1.6; }

    .risk-box {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .risk-title { font-size: 12px; font-weight: 700; color: #c2410c; margin-bottom: 8px; }
    .risk-item { font-size: 13px; color: #9a3412; }

    .alt-section { margin-top: 8px; }
    .alt-row {
      display: grid;
      grid-template-columns: 160px 90px 1fr;
      gap: 12px;
      align-items: start;
      padding: 10px 0;
      border-top: 1px solid #f1f5f9;
      font-size: 13px;
    }
    .alt-name { font-weight: 600; color: #334155; }
    .alt-cost { color: #64748b; }
    .alt-tradeoff { color: #64748b; }

    .refresh-btn {
      display: block;
      max-width: 900px;
      margin: 16px auto 0;
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
    }
    .refresh-btn a { color: #6366f1; text-decoration: none; font-weight: 600; }
    .refresh-btn a:hover { text-decoration: underline; }

    @media (max-width: 600px) {
      .order-grid { grid-template-columns: repeat(2, 1fr); }
      .alt-row { grid-template-columns: 1fr 1fr; }
      .alt-tradeoff { grid-column: 1 / -1; }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="page-title">Smart Carrier Selection</div>
    <div class="page-sub">AI-powered carrier recommendation for fulfillment platform</div>
    ${aiMode}
  </div>

  <div class="cards">
    ${scenarioHtml}
  </div>

  <div class="refresh-btn">
    <a href="/">Refresh</a> to re-run both scenarios
  </div>
</body>
</html>`;
}

app.get("/", async (_req, res) => {
  try {
    const [s1, s2] = await Promise.all([
      runScenario(SAMPLE_INPUT_FRAGILE_COD, "Fragile item + COD, tight SLA, Chiang Mai"),
      runScenario(SAMPLE_INPUT_HEAVY_ECONOMY, "Heavy item, cost-sensitive, Bangkok"),
    ]);
    const apiKeyPresent = !!process.env.ANTHROPIC_API_KEY;
    res.send(renderPage([s1, s2], apiKeyPresent));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`<pre>Error: ${msg}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`\nSmart Carrier Selection Demo`);
  console.log(`Open: http://localhost:${PORT}`);
  console.log(`API Key: ${process.env.ANTHROPIC_API_KEY ? "present (Claude AI active)" : "not set (fallback mode)"}`);
});
