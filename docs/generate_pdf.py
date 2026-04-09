#!/usr/bin/env python3
"""Generate C6 Revenue SDK Integration Guide PDF using ReportLab."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Preformatted
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import os

C6_BLUE = HexColor('#00B4D8')
C6_DARK = HexColor('#0a0a0f')
C6_GREEN = HexColor('#10b981')
C6_GRAY = HexColor('#666666')
C6_LGRAY = HexColor('#f0f0f0')
WHITE = HexColor('#ffffff')

output_path = os.path.join(os.path.dirname(__file__), 'C6_Revenue_SDK_Integration_Guide.pdf')

doc = SimpleDocTemplate(
    output_path,
    pagesize=letter,
    topMargin=0.75*inch,
    bottomMargin=0.75*inch,
    leftMargin=0.85*inch,
    rightMargin=0.85*inch,
)

styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle('DocTitle', parent=styles['Title'], fontSize=22, textColor=C6_BLUE, spaceAfter=4))
styles.add(ParagraphStyle('DocSubtitle', parent=styles['Normal'], fontSize=12, textColor=C6_GRAY, alignment=TA_CENTER, spaceAfter=20))
styles.add(ParagraphStyle('SectionHead', parent=styles['Heading1'], fontSize=16, textColor=C6_BLUE, spaceBefore=20, spaceAfter=8, borderWidth=0))
styles.add(ParagraphStyle('SubHead', parent=styles['Heading2'], fontSize=13, textColor=HexColor('#333333'), spaceBefore=14, spaceAfter=6))
styles.add(ParagraphStyle('Body', parent=styles['Normal'], fontSize=10.5, leading=15, spaceAfter=6))
styles.add(ParagraphStyle('C6Bullet', parent=styles['Normal'], fontSize=10.5, leading=15, leftIndent=20, bulletIndent=10, spaceAfter=3))
styles.add(ParagraphStyle('C6Code', fontName='Courier', fontSize=9, leading=12, backColor=C6_LGRAY, leftIndent=12, rightIndent=12, spaceBefore=6, spaceAfter=6, borderPadding=6))
styles.add(ParagraphStyle('CodeBlock', fontName='Courier', fontSize=8.5, leading=11, backColor=C6_LGRAY, leftIndent=12, rightIndent=12, spaceBefore=4, spaceAfter=8, borderPadding=8))
styles.add(ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9, textColor=C6_GRAY, alignment=TA_CENTER, spaceBefore=20))

def heading(text):
    return Paragraph(text, styles['SectionHead'])

def subhead(text):
    return Paragraph(text, styles['SubHead'])

def body(text):
    return Paragraph(text, styles['Body'])

def bullet(text):
    return Paragraph(f'• {text}', styles['C6Bullet'])

def code(text):
    return Preformatted(text, styles['CodeBlock'])

def hr():
    return HRFlowable(width='100%', thickness=1, color=HexColor('#dddddd'), spaceBefore=8, spaceAfter=8)

def make_table(headers, rows):
    data = [headers] + rows
    t = Table(data, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C6_BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), WHITE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, C6_LGRAY]),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cccccc')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
    ]))
    return t

# ─── Build Document ────────────────────────────────────────────────

story = []

# Title
story.append(Paragraph('C6 Revenue SDK', styles['DocTitle']))
story.append(Paragraph('Integration Guide', styles['DocSubtitle']))
story.append(Paragraph('Version 2.0.0 — April 2026', styles['DocSubtitle']))
story.append(hr())

# Overview
story.append(heading('Overview'))
story.append(body('The C6 Revenue SDK is a zero-dependency, single-file library that enables API key gating, usage metering, and x402 micropayments for any tool shipped through C6 Launch.'))
story.append(Spacer(1, 6))
story.append(bullet('<b>Revenue split:</b> 15% Carbon6 / 85% Partner'))
story.append(bullet('<b>Offline-first</b> — caches gateway responses, queues usage locally'))
story.append(bullet('<b>Single file</b> — no npm install, no pip install'))
story.append(bullet('<b>Auto-config</b> — reads .c6-partner.json automatically'))
story.append(bullet('<b>Non-blocking</b> — startup ping has a 3-second timeout'))

# Auto-injected
story.append(hr())
story.append(heading('Auto-Shipped Tools'))
story.append(body('If your tool was shipped via <b>c6-launch ship</b>, <b>you don\'t need to do anything</b>. The SDK is auto-injected during packaging:'))
story.append(Spacer(1, 4))
story.append(bullet('<font name="Courier">lib/c6-revenue.js</font> (or <font name="Courier">.py</font>) is copied into your tool'))
story.append(bullet('<font name="Courier">.c6-partner.json</font> is configured with revenue settings'))
story.append(bullet('CLI tools get <font name="Courier">init().ping()</font> prepended to the entry point'))
story.append(bullet('Services get integration instructions in the README'))

# Manual Integration
story.append(hr())
story.append(heading('Manual Integration'))

story.append(subhead('Step 1 — Copy the SDK'))
story.append(code('# JavaScript\ncp sdk/c6-revenue.js  your-tool/lib/c6-revenue.js\n\n# Python\ncp sdk/c6-revenue.py  your-tool/lib/c6_revenue.py'))

story.append(subhead('Step 2 — Initialize in Your Entry Point'))
story.append(body('<b>JavaScript — CLI Tool:</b>'))
story.append(code("import { init } from './lib/c6-revenue.js';\ninit({ toolId: 'your-tool-name' }).ping();\n\n// ... rest of your CLI code"))

story.append(body('<b>JavaScript — Express/Fastify API:</b>'))
story.append(code("import { init } from './lib/c6-revenue.js';\nimport express from 'express';\n\nconst app = express();\nconst c6 = init({ toolId: 'your-tool-name' });\nc6.ping();\n\n// Gate all routes with API key\napp.use(c6.middleware());\n\napp.get('/data', (req, res) => {\n  // req.c6.tier = 'free' | 'pro' | 'enterprise'\n  res.json({ data: '...' });\n});"))

story.append(body('<b>Python:</b>'))
story.append(code('from lib.c6_revenue import init\n\nc6 = init({"toolId": "your-tool-name"})\nc6.ping()\n\nresult = c6.gate(api_key, "search")\nif not result["allowed"]:\n    print(f"Access denied: {result[\'reason\']}")'))

# API Keys
story.append(hr())
story.append(heading('Step 3 — Generate API Keys'))
story.append(code('# Free tier (100 calls/day)\nc6-launch keys generate your-tool-name\n\n# Pro tier (10,000 calls/day)\nc6-launch keys generate your-tool-name --tier=pro\n\n# Enterprise (unlimited)\nc6-launch keys generate your-tool-name --tier=enterprise\n\n# List all keys\nc6-launch keys list your-tool-name\n\n# Revoke a key\nc6-launch keys revoke <hash>'))
story.append(Spacer(1, 4))
story.append(body('Key format: <font name="Courier">C6K-&lt;toolId&gt;-&lt;base64url(payload)&gt;.&lt;HMAC-SHA256&gt;</font>'))
story.append(body('Keys are offline-validatable — the SDK verifies the HMAC without hitting the gateway.'))

# Gateway
story.append(hr())
story.append(heading('Step 4 — Start the Revenue Gateway'))
story.append(code('c6-launch gateway            # default port 6100\nc6-launch gateway --port=7000  # custom port'))
story.append(Spacer(1, 4))
story.append(body('Open the dashboard at <font name="Courier" color="blue">http://localhost:6100/api/v1/revenue/html</font>'))
story.append(Spacer(1, 6))

story.append(make_table(
    ['Endpoint', 'Method', 'Purpose'],
    [
        ['/api/v1/ping', 'POST', 'Startup telemetry'],
        ['/api/v1/gate', 'POST', 'Key validation + rate check'],
        ['/api/v1/usage/batch', 'POST', 'Bulk usage upload'],
        ['/api/v1/keys/generate', 'POST', 'Create API key'],
        ['/api/v1/keys/list', 'GET', 'List keys by tool'],
        ['/api/v1/revenue', 'GET', 'Revenue data (JSON)'],
        ['/api/v1/revenue/html', 'GET', 'Revenue dashboard (HTML)'],
        ['/api/v1/x402/charge', 'POST', 'x402 micropayment'],
    ]
))

# Production
story.append(PageBreak())
story.append(heading('Step 5 — Production Configuration'))
story.append(body('Swap the gateway URL in <font name="Courier">.c6-partner.json</font>:'))
story.append(code('{\n  "revenue": {\n    "toolId": "your-tool-name",\n    "model": "freemium",\n    "gatewayUrl": "https://carbon6.agency/api/v1",\n    "split": { "carbon6": 0.15, "partner": 0.85 }\n  }\n}'))
story.append(body('The SDK hits the same endpoints — routed to the Carbon6 platform connector instead of localhost.'))

# Revenue Models
story.append(hr())
story.append(heading('Revenue Models'))
story.append(Spacer(1, 4))
story.append(make_table(
    ['Model', 'Description', 'Best For'],
    [
        ['freemium', '100 calls/day free, paid upgrade', 'CLI tools, utilities'],
        ['api-key', 'Key required for all access', 'Professional APIs'],
        ['metered', 'x402 micropayment per call', 'Premium data, AI'],
        ['tiered', 'Feature gates by tier', 'SaaS-style tools'],
    ]
))
story.append(Spacer(1, 6))
story.append(body('Set during ship: <font name="Courier">c6-launch ship my-tool --model=metered</font>'))

# End Users
story.append(hr())
story.append(heading('What End Users See'))
story.append(body('Users pass their API key via header or environment variable:'))
story.append(code('# CLI tools\nexport C6_API_KEY=C6K-your-tool-...\nyour-tool do-something\n\n# API tools\ncurl -H "x-api-key: C6K-your-tool-..." \\\n  https://your-api/endpoint'))

# SDK Reference
story.append(hr())
story.append(heading('SDK API Reference'))
story.append(subhead('JavaScript'))
story.append(make_table(
    ['Method', 'Description'],
    [
        ['init(config?)', 'Initialize SDK, returns C6Revenue instance'],
        ['c6.ping()', 'Fire-and-forget startup telemetry'],
        ['c6.gate(apiKey, op?)', 'Validate key + check rate limit'],
        ['c6.paywall(amount, meta?)', 'x402 micropayment request'],
        ['c6.recordUsage(op?)', 'Record usage locally'],
        ['c6.flush()', 'Batch upload cached usage'],
        ['c6.middleware(opts?)', 'Express/Fastify middleware'],
    ]
))
story.append(Spacer(1, 8))
story.append(subhead('Python'))
story.append(make_table(
    ['Method', 'Description'],
    [
        ['init(config?)', 'Initialize SDK, returns C6Revenue instance'],
        ['c6.ping()', 'Fire-and-forget startup telemetry (threaded)'],
        ['c6.gate(api_key, op?)', 'Validate key + check rate limit'],
        ['c6.paywall(amount, meta?)', 'x402 micropayment request'],
        ['c6.record_usage(op?)', 'Record usage locally'],
        ['c6.flush()', 'Batch upload cached usage'],
    ]
))

# Monitoring
story.append(hr())
story.append(heading('Monitoring Revenue'))
story.append(code('# All tools\nc6-launch revenue\n\n# Specific tool\nc6-launch revenue your-tool-name\n\n# Export to CSV\nc6-launch revenue --export=csv'))

# Footer
story.append(Spacer(1, 30))
story.append(hr())
story.append(Paragraph('Powered by CARBON[6] — https://carbon6.agency', styles['Footer']))
story.append(Paragraph('https://github.com/VltrnOne/c6-launch', styles['Footer']))

# Build
doc.build(story)
print(f'PDF generated: {output_path}')
