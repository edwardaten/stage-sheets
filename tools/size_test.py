"""Readability test sheet: same page size as Stage Sheets PDFs (540 x 720 pt, iPad ratio)."""
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import sys
import os
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'fonts') + '/'
for n, f in [('Mono', 'mono-reg'), ('MonoBold', 'mono-bold'), ('CondBold', 'cond-bold'), ('CondMed', 'cond-med')]:
    pdfmetrics.registerFont(TTFont(n, F + f + '.ttf'))
W, H, M = 540, 720, 30
INK, MUTED, FAINT, CHORD, AMBER = '#14161B', '#6A717D', '#D9DDE3', '#1A4FD6', '#F4B400'
TINTS = ['#EEF2F8', '#FFF0E3', '#F1EAFB', '#E6F5F2', '#EAF5EC', '#FFF8E0']
BARS = ['#4B5B76', '#E25A0E', '#7A3FD1', '#0E8C80', '#2E8A3A', '#E0A100']
CH = 'G         Am                C          D'
LY = 'Every one a little wish I folded up and let it go'
SANS = 'Every one a little wish I folded up and let it go, and the tide keeps rolling in'

c = canvas.Canvas(sys.argv[1], pagesize=(W, H))
c.setTitle('Stage Sheets text size test')
y = H - 28
c.setFillColor(INK); c.setFont('CondBold', 26); c.drawString(M, y - 20, 'Text size test')
c.setFillColor(MUTED); c.setFont('CondMed', 11.5)
c.drawString(M, y - 38, 'Open full screen in forScore, put the iPad on your stand, and play from your normal position.')
c.drawString(M, y - 52, 'Pick the smallest size you can read at a glance. Top line in each band: chords over lyrics.')
c.drawString(M, y - 66, 'Bottom line: lyrics only, in the narrow font used for loop sections.')
y -= 84
c.setFillColor(FAINT); c.rect(M, y, W - 2 * M, 0.8, stroke=0, fill=1)
y -= 10
for i, s in enumerate([11, 12, 13, 14, 15, 16]):
    h = s * 1.05 + s * 1.27 + s * 1.32 + 14
    top = y; bot = y - h
    c.setFillColor(TINTS[i]); c.roundRect(M, bot, W - 2 * M, h, 5, stroke=0, fill=1)
    c.setFillColor(BARS[i]); c.rect(M, bot, 3.5, h, stroke=0, fill=1)
    # size tag
    c.setFillColor(BARS[i]); c.setFont('CondBold', 13); c.drawRightString(W - M - 10, top - 18, f'{s} pt')
    c.setFillColor(MUTED); c.setFont('CondMed', 8)
    full, col = int(472 / (0.6 * s)), int(226 / (0.6 * s))
    c.drawRightString(W - M - 10, top - 30, f'{full} letters across')
    c.drawRightString(W - M - 10, top - 40, f'{col} per column')
    x = M + 14
    yy = top - 7 - s * 0.95
    # chord row
    c.setFont('MonoBold', s); c.setFillColor(CHORD)
    for j, ch in enumerate(CH):
        pass
    import re
    for m in re.finditer(r'\S+', CH):
        c.drawString(x + m.start() * 0.6 * s, yy, m.group())
    yy -= s * 1.22
    def fit(text, font, size):
        words, out = text.split(' '), ''
        for w in words:
            t = (out + ' ' + w).strip()
            if pdfmetrics.stringWidth(t, font, size) > 400: break
            out = t
        return out
    c.setFont('Mono', s); c.setFillColor(INK); c.drawString(x, yy, fit(LY, 'Mono', s))
    yy -= s * 1.42
    c.setFont('CondMed', s * 1.08); c.drawString(x, yy, fit(SANS, 'CondMed', s * 1.08))
    y = bot - 7
c.setFillColor(MUTED); c.setFont('CondMed', 9)
c.drawString(M, 18, 'Current app range: 11.5 to 15 pt. Pages are 540 x 720 pt, the iPad Pro screen shape.')
c.save()
