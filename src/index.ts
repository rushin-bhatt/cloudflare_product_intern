/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// export default {
// 	async fetch(request, env, ctx): Promise<Response> {
// 		return new Response('Hello World!');
// 	},
// } satisfies ExportedHandler<Env>;

export interface Env {
  feedback_db: D1Database;
  AI: any;
}

async function initializeDB(db: D1Database) {
  // Create table if it doesn't exist
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      summary TEXT,
      sentiment TEXT,
      themes TEXT
    )
  `).run();

  // Add themes column if it doesn't exist (for existing databases)
  try {
    await db.prepare(`ALTER TABLE feedback ADD COLUMN themes TEXT`).run();
  } catch (error) {
    // Column might already exist, ignore error
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Initialize DB on first request
    await initializeDB(env.feedback_db);

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(renderHTML(), {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (req.method === "POST" && url.pathname === "/feedback") {
      const body: { source: string; content: string } = await req.json();
      const { source, content } = body;

      await env.feedback_db.prepare(
        "INSERT INTO feedback (source, content) VALUES (?, ?)"
      )
        .bind(source, content)
        .run();

      return Response.json({ success: true });
    }

    if (req.method === "POST" && url.pathname === "/analyze") {
      // Fetch last 20 feedback entries for analysis
      const rows = await env.feedback_db.prepare(
        "SELECT content FROM feedback ORDER BY created_at DESC LIMIT 20"
      ).all();

      const feedbackList = rows.results.map((r: any) => r.content);

      let resultText: string;
      try {
        // Use Workers AI with detailed prompt for product manager analysis
        const aiResponse = await env.AI.run(
          "@cf/meta/llama-3-8b-instruct",
          {
            messages: [
              {
                role: "system",
                content: `
You are an AI assistant for product managers analyzing user feedback.

Input: A list of user feedback strings.

Output JSON only, structured exactly as:
{
  "summary": "Concise 1-2 sentence summary of feedback",
  "sentiment": "positive | neutral | negative",
  "themes": ["theme1", "theme2", ...] // 3-5 key themes
}

Steps you should follow:
1. Categorize each feedback into themes.
2. Determine overall sentiment of all feedback (positive, neutral, negative).
3. Generate a short, actionable summary for a PM.
4. Ignore duplicates and trivial feedback.
5. Do not include any extra text outside JSON.
6. Use structured thinking: analyze, summarize, classify.
                `,
              },
              {
                role: "user",
                content: `Feedback:\n${feedbackList.join("\n")}`,
              },
            ],
          }
        );
        resultText = aiResponse.response;
      } catch (error) {
        // Fallback for local dev where AI is not available
        resultText = JSON.stringify({
          summary: "Mock summary for local development",
          sentiment: "neutral",
          themes: ["mock theme 1", "mock theme 2"]
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(resultText);
        // Ensure themes is an array
        if (!Array.isArray(parsed.themes)) {
          parsed.themes = [];
        }
      } catch {
        // Handle parsing errors gracefully with fallback
        parsed = {
          summary: "AI output parsing failed",
          sentiment: "neutral",
          themes: [],
        };
      }

      // Store analysis results in the latest feedback entry
      await env.feedback_db.prepare(
        "UPDATE feedback SET summary = ?, sentiment = ?, themes = ? WHERE id = (SELECT id FROM feedback ORDER BY created_at DESC LIMIT 1)"
      )
        .bind(parsed.summary, parsed.sentiment, JSON.stringify(parsed.themes))
        .run();

      return Response.json(parsed);
    }

    if (req.method === "GET" && url.pathname === "/insights") {
      // Return latest summary, sentiment, and themes
      const row = await env.feedback_db.prepare(
        "SELECT summary, sentiment, themes FROM feedback WHERE summary IS NOT NULL ORDER BY created_at DESC LIMIT 1"
      ).first();

      if (row) {
        // Parse themes from JSON string
        row.themes = row.themes && typeof row.themes === 'string' ? JSON.parse(row.themes) : [];
      }

      return Response.json(row || {});
    }



    return new Response("Not found", { status: 404 });
  },
};

function renderHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback Insights Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #000000;
      min-height: 100vh;
      padding: 20px;
      color: #ffffff;
      line-height: 1.6;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: #000000;
      border-radius: 24px;
      box-shadow: 0 25px 50px rgba(255,255,255,0.08), 0 15px 35px rgba(255,255,255,0.04);
      overflow: hidden;
      border: 1px solid #333333;
    }

    .header {
      background: linear-gradient(135deg, #ffffff 0%, #cccccc 100%);
      color: #000000;
      padding: 50px 40px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="black" opacity="0.03"/><circle cx="75" cy="75" r="1" fill="black" opacity="0.03"/><circle cx="50" cy="10" r="0.5" fill="black" opacity="0.02"/><circle cx="10" cy="50" r="0.5" fill="black" opacity="0.02"/><circle cx="90" cy="30" r="0.5" fill="black" opacity="0.02"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
    }

    .header h1 {
      font-size: 3rem;
      margin-bottom: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      position: relative;
      z-index: 1;
    }

    .header p {
      opacity: 0.9;
      font-size: 1.2rem;
      font-weight: 400;
      position: relative;
      z-index: 1;
    }

    .content {
      padding: 50px 40px;
    }

    .section {
      margin-bottom: 50px;
      background: #111111;
      border-radius: 20px;
      padding: 40px;
      border: 1px solid #333333;
      position: relative;
      transition: all 0.3s ease;
    }

    .section:hover {
      box-shadow: 0 10px 30px rgba(255,255,255,0.06);
      transform: translateY(-2px);
    }

    .section h3 {
      color: #ffffff;
      margin-bottom: 25px;
      font-size: 1.6rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .form-group {
      margin-bottom: 25px;
    }

    .form-group label {
      display: block;
      margin-bottom: 10px;
      font-weight: 600;
      color: #cccccc;
      font-size: 1rem;
    }

    textarea {
      width: 100%;
      min-height: 140px;
      padding: 20px;
      border: 2px solid #333333;
      border-radius: 12px;
      font-family: inherit;
      font-size: 1rem;
      resize: vertical;
      transition: all 0.3s ease;
      background: #000000;
      color: #ffffff;
      line-height: 1.6;
    }

    textarea:focus {
      outline: none;
      border-color: #ffffff;
      box-shadow: 0 0 0 4px rgba(255,255,255,0.08);
      background: #000000;
    }

    textarea::placeholder {
      color: #666666;
    }

    .btn {
      background: #ffffff;
      color: #000000;
      border: 2px solid #ffffff;
      padding: 18px 36px;
      border-radius: 12px;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      position: relative;
      overflow: hidden;
    }

    .btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(0,0,0,0.2), transparent);
      transition: left 0.5s;
    }

    .btn:hover::before {
      left: 100%;
    }

    .btn:hover {
      background: #000000;
      color: #ffffff;
      transform: translateY(-2px);
      box-shadow: 0 15px 35px rgba(255,255,255,0.15);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn.secondary {
      background: #000000;
      color: #ffffff;
      border: 2px solid #ffffff;
    }

    .btn.secondary:hover {
      background: #ffffff;
      color: #000000;
    }

    .insights-container {
      background: #ffffff;
      color: #000000;
      border-radius: 12px;
      padding: 25px;
      min-height: 180px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      white-space: pre-wrap;
      word-wrap: break-word;
      border: 2px solid #cccccc;
      font-size: 0.95rem;
      line-height: 1.5;
      position: relative;
    }

    .insights-container::before {
      content: '⚡';
      position: absolute;
      top: 15px;
      right: 15px;
      font-size: 1.2rem;
      opacity: 0.7;
    }

    .loading {
      display: none;
      color: #000000;
      font-style: italic;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .success-message {
      background: #1a3d1a;
      color: #b8d4b8;
      padding: 18px 20px;
      border-radius: 12px;
      margin-top: 20px;
      border: 2px solid #2d5a2d;
      display: none;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }

    .stat-card {
      background: #111111;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      border: 1px solid #333333;
    }

    .stat-number {
      font-size: 2rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 5px;
    }

    .stat-label {
      color: #999999;
      font-size: 0.9rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    @media (max-width: 768px) {
      .container {
        margin: 10px;
        border-radius: 16px;
      }

      .header {
        padding: 35px 25px;
      }

      .header h1 {
        font-size: 2.2rem;
      }

      .header p {
        font-size: 1rem;
      }

      .content {
        padding: 35px 25px;
      }

      .section {
        padding: 25px;
        margin-bottom: 35px;
      }

      .section h3 {
        font-size: 1.4rem;
      }

      .btn {
        padding: 15px 25px;
        font-size: 1rem;
      }

      .stats {
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
      }
    }

    @media (max-width: 480px) {
      .stats {
        grid-template-columns: 1fr;
      }

      .header h1 {
        font-size: 1.8rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Feedback Insights</h1>
      <p>AI-Powered Feedback Analysis Dashboard</p>
    </div>

    <div class="content">
      <div class="section">
        <h3>💬 Submit Feedback</h3>
        <div class="form-group">
          <label for="content">Share your thoughts about our product:</label>
          <textarea id="content" placeholder="Tell us what you think... What do you like? What could be improved?"></textarea>
        </div>
        <button class="btn" onclick="submitFeedback()">🚀 Submit Feedback</button>
        <div id="success-message" class="success-message">✅ Feedback submitted successfully!</div>
      </div>

      <div class="section">
        <h3>🤖 AI Analysis</h3>
        <p style="margin-bottom: 20px; color: #666;">Click below to analyze recent feedback using AI</p>
        <button class="btn secondary" onclick="analyze()">
          <span id="analyze-text">🔍 Run AI Analysis</span>
          <span id="loading" class="loading">Analyzing feedback...</span>
        </button>
      </div>

      <div class="section">
        <h3>📈 Insights</h3>
        <div id="insights" class="insights-container">No insights available yet. Submit some feedback and run analysis!</div>
      </div>
    </div>
  </div>

  <script>
    async function submitFeedback() {
      const content = document.getElementById("content").value.trim();
      if (!content) {
        alert("Please enter some feedback first!");
        return;
      }

      try {
        const response = await fetch("/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "web", content })
        });

        if (response.ok) {
          document.getElementById("content").value = "";
          const msg = document.getElementById("success-message");
          msg.style.display = "block";
          setTimeout(() => msg.style.display = "none", 3000);
        } else {
          alert("Failed to submit feedback. Please try again.");
        }
      } catch (error) {
        alert("Network error. Please check your connection.");
      }
    }

    async function analyze() {
      const analyzeBtn = document.querySelector('.btn.secondary');
      const analyzeText = document.getElementById("analyze-text");
      const loading = document.getElementById("loading");

      analyzeBtn.disabled = true;
      analyzeText.style.display = "none";
      loading.style.display = "inline";

      try {
        const res = await fetch("/analyze", { method: "POST" });
        const data = await res.json();

        document.getElementById("insights").innerText = JSON.stringify(data, null, 2);
      } catch (error) {
        document.getElementById("insights").innerText = "Error: Failed to analyze feedback. Please try again.";
      } finally {
        analyzeBtn.disabled = false;
        analyzeText.style.display = "inline";
        loading.style.display = "none";
      }
    }
  </script>
</body>
</html>
  `;
}

