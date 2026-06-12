#!/bin/bash
# patch_gp_agent.sh — 替换 analyze handler 为直调 DeepSeek API
set -e

FILE="/opt/golden-project/gp-agent-server.js"
RULES_FILE="/opt/golden-project/analysis_rules.md"
BAK="${FILE}.bak2"

# 读规则文件
if [ ! -f "$RULES_FILE" ]; then
  echo "⚠️  analysis_rules.md 不存在，先创建"
  cat > "$RULES_FILE" << 'RULES'
# Golden Project 文档分析规则 v1.0

## 核心约束
- **只输出 JSON，不要任何额外文字**（包括 markdown 代码块标记）
- 发现不了的信息用 null，不编造
- 日期统一用 YYYY-MM-DD 格式

## JSON Schema
{
  "projectName": "项目名称",
  "shortName": "项目简称",
  "projectCode": "项目编码",
  "projectType": "项目类型（会议/展览/活动/其他）",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "description": "项目描述（200字内）",
  "organizer": "主办单位",
  "executor": "执行单位",
  "modules": [{"name":"模块名称","leader":"负责人","desc":"模块描述"}],
  "activities": [{"name":"活动名称","date":"YYYY-MM-DD","time":"开始-结束","venue":"场地","module":"所属模块","leader":"负责人","assistant":"协助人","status":"confirmed/pending"}],
  "contacts": [{"org":"单位","role":"职能","name":"联系人","mobile":"手机","feishuId":"飞书ID","matter":"对接事项","level":"核心/重要/一般"}],
  "vendors": [{"name":"供应商","service":"服务内容","contact":"联系人","phone":"电话","contractStatus":"已签约/洽谈中/意向阶段","manager":"对接负责人"}],
  "venues": [{"name":"场地名称","purpose":"用途","activity":"所属活动","org":"责任单位","leader":"负责人","phone":"联系方式","status":"已确认/待确认"}],
  "tasks": [{"title":"任务名称","module":"所属模块","owner":"负责人","deadline":"YYYY-MM-DD","priority":"高/中/低","status":"pending/in_progress/collaborating/completed/at_risk"}],
  "risks": [{"name":"风险名称","module":"影响模块","probability":"高/中/低","impact":"高/中/低","plan":"应对预案","owner":"负责人","deadline":"YYYY-MM-DD"}]
}

## 提取规则
- projectName: 优先文档标题/文件名/首段
- dates: 跨天取首尾，年份不明取当年
- modules: 从议程提取每个环节
- contacts: 从参会名单取，不去重
- tasks priority: deadline<30天=高, <90天=中, 其余=低
- 找不到的字段用 null，不编造

## 示例
{"projectName":"全球科技创新峰会","shortName":"GTS2026","projectCode":"GP-2026-008","projectType":"会议","startDate":"2026-09-15","endDate":"2026-09-18","description":"全球顶尖科技峰会","organizer":"中国科技创新促进会","executor":"GP执行团队","modules":[{"name":"开幕式","leader":"张明远","desc":"主旨演讲"}],"activities":[],"contacts":[],"vendors":[],"venues":[],"tasks":[],"risks":[]}
RULES
fi

RULES_CONTENT=$(cat "$RULES_FILE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
# Remove surrounding quotes
RULES_CONTENT="${RULES_CONTENT%\"}"
RULES_CONTENT="${RULES_CONTENT#\"}"

# 备份
cp "$FILE" "$BAK"
echo "✅ 已备份到 $BAK"

# 替换 analyze handler 中的 callDeepSeek 调用为直调 DeepSeek API
python3 << 'PYEOF'
import re

with open('/opt/golden-project/gp-agent-server.js', 'r') as f:
    content = f.read()

# Read the rules
with open('/opt/golden-project/analysis_rules.md', 'r') as f:
    rules = f.read()

# Find the analyze handler: from the comment "// POST /intake/:projectId/analyze"
# up to the next "// POST" or "// GET" or "// ..."
old_handler_start = content.find("// POST /intake/:projectId/analyze - Analyze uploaded documents")
if old_handler_start == -1:
    print("ERROR: Could not find analyze handler")
    exit(1)

# Find the end of this handler (next route comment)
handler_end = content.find("\n    //", old_handler_start + 1)
if handler_end == -1:
    handler_end = len(content)

old_handler = content[old_handler_start:handler_end]

# Escape special JSON chars in rules
rules_escaped = rules.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

new_handler = f'''    // POST /intake/:projectId/analyze - Analyze uploaded documents (uses DeepSeek API directly)
    if (req.method === 'POST' && parts[0] === 'intake' && parts[1] && parts[2] === 'analyze') {{
      const pid = parts[1];
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {{
        try {{
          const {{ files }} = JSON.parse(body);
          const project = await gpApi('GET', '/api/projects/' + pid).catch(() => ({{}}));
          const projectName = project.name || '未命名项目';

          // Parse uploaded files to extract text content
          const parseScript = '/opt/golden-project/parse_file.py';
          let fileTexts = [];
          for (const f of files) {{
            try {{
              const result = execSync('python3 ' + parseScript + ' ' + JSON.stringify(f.name), {{
                input: f.content,
                timeout: 30000,
                maxBuffer: 10 * 1024 * 1024,
              }}).toString().trim();
              fileTexts.push('文件: ' + f.name + '\\n内容:\\n' + result.slice(0, 8000));
            }} catch(e) {{
              fileTexts.push('文件: ' + f.name + '\\n内容: [解析失败: ' + e.message.slice(0, 100) + ']');
            }}
          }}

          const userPrompt = `项目名称: ${{projectName}}
上传文件:
${{fileTexts.join('\\n')}}

请严格按照规则输出JSON。`;

          // Direct DeepSeek API call (faster for analysis)
          const https = require('https');
          const DEEPSEEK_KEY = process.env.GP_AGENT_KEY || '';
          const data = JSON.stringify({{
            model: 'deepseek-chat',
            messages: [
              {{ role: 'system', content: `${{rules_escaped}}` }},
              {{ role: 'user', content: userPrompt }}
            ],
            temperature: 0.1,
            max_tokens: 4000,
            response_format: {{ type: 'json_object' }}
          }});

          const reply = await new Promise((resolve, reject) => {{
            const req = https.request('https://api.deepseek.com/chat/completions', {{
              method: 'POST',
              headers: {{ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_KEY }},
            }}, (res) => {{
              let d = '';
              res.on('data', c => d += c);
              res.on('end', () => {{
                try {{
                  const parsed = JSON.parse(d);
                  resolve(parsed.choices?.[0]?.message?.content || '');
                }} catch {{ resolve(''); }}
              }});
            }});
            req.on('error', reject);
            req.write(data);
            req.end();
          }});

          let analysisData;
          try {{
            analysisData = JSON.parse(reply);
          }} catch(e) {{
            // Try to extract JSON from response
            const m = reply.match(/\\{{[\\s\\S]*?\\}}/);
            if (m) {{
              try {{ analysisData = JSON.parse(m[0]); }} catch {{ analysisData = {{ error: 'JSON解析失败', raw: reply.slice(0, 500) }}; }}
            }} else {{
              analysisData = {{ error: 'AI返回非JSON格式', raw: reply.slice(0, 500) }};
            }}
          }}

          res.writeHead(200, {{ 'Content-Type': 'application/json' }});
          if (analysisData.error) {{
            return res.end(JSON.stringify({{ error: analysisData.error, raw: analysisData.raw }}));
          }}

          // Store the analysis result
          const storeKey = 'intake_' + pid;
          if (!global.__intakeStore) global.__intakeStore = {{}};
          global.__intakeStore[storeKey] = analysisData;

          return res.end(JSON.stringify({{ data: analysisData }}));
        }} catch(e) {{
          res.writeHead(500, {{ 'Content-Type': 'application/json' }});
          return res.end(JSON.stringify({{ error: '分析服务异常: ' + e.message }}));
        }}
      }});
    }}'''

content = content[:old_handler_start] + new_handler + content[handler_end:]

with open('/opt/golden-project/gp-agent-server.js', 'w') as f:
    f.write(content)

print("✅ 分析 handler 已替换为直调 DeepSeek API")
PYEOF

echo "✅ 补丁完成！"
echo "请执行: pm2 restart gp-agent"
