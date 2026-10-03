"""Builds 01-facility-agreement-160p.pdf (fictional, DIFC law, ~160 pages)."""
import random, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                PageBreak, Table, TableStyle, KeepTogether)
from reportlab.pdfgen import canvas as rl_canvas
from facility_content import CLAUSES, DEFINITIONS, PARTIES, REPEATED, padding

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Serif", FONT_DIR + "DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("Serif-Bold", FONT_DIR + "DejaVuSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Serif-Italic", FONT_DIR + "DejaVuSerif-Italic.ttf"))
pdfmetrics.registerFontFamily("Serif", normal="Serif", bold="Serif-Bold", italic="Serif-Italic",
                              boldItalic="Serif-Bold")

PAD_PER_CLAUSE = int(sys.argv[1]) if len(sys.argv) > 1 else 10
OUT = sys.argv[2] if len(sys.argv) > 2 else "out/01-facility-agreement-162p.pdf"

body = ParagraphStyle("body", fontName="Serif", fontSize=10.5, leading=15, alignment=TA_JUSTIFY,
                      spaceAfter=6, hyphenationLang="en_GB", embeddedHyphenation=1,
                      uriWasteReduce=0.3, hyphenationMinWordLength=13)
sub = ParagraphStyle("sub", parent=body, leftIndent=12 * mm, firstLineIndent=-10 * mm)
h1 = ParagraphStyle("h1", fontName="Serif-Bold", fontSize=12, leading=16, spaceBefore=14,
                    spaceAfter=8, keepWithNext=1)
title = ParagraphStyle("title", fontName="Serif-Bold", fontSize=20, leading=26, alignment=TA_CENTER)
center = ParagraphStyle("center", fontName="Serif", fontSize=11, leading=16, alignment=TA_CENTER)
cell = ParagraphStyle("cell", fontName="Serif", fontSize=9, leading=12)


class NumberedCanvas(rl_canvas.Canvas):
    """Two-pass canvas so every page can show 'Page X of Y'."""
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            if self._pageNumber > 1:
                self.setFont("Serif", 8)
                self.setFillColor(colors.grey)
                w, h = A4
                self.drawString(20 * mm, h - 12 * mm,
                                "Term Facility Agreement – Al Noor Trading L.L.C.")
                self.drawRightString(w - 20 * mm, h - 12 * mm, "CONFIDENTIAL – EXECUTION VERSION")
                self.drawCentredString(w / 2, 10 * mm, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


def table(rows, widths, header=True):
    data = [[Paragraph(str(c), cell) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE") if header else colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def build():
    rng = random.Random(42)
    story = []
    # Cover
    story += [Spacer(1, 50 * mm), Paragraph("TERM FACILITY AGREEMENT", title), Spacer(1, 10 * mm),
              Paragraph("dated 14 March 2026", center), Spacer(1, 15 * mm),
              Paragraph("for", center), Spacer(1, 4 * mm),
              Paragraph(f"<b>{PARTIES['borrower']}</b><br/>as Borrower", center), Spacer(1, 6 * mm),
              Paragraph(f"<b>{PARTIES['guarantor']}</b><br/>as Guarantor", center), Spacer(1, 6 * mm),
              Paragraph(f"<b>{PARTIES['lender']}</b><br/>as Lender", center), Spacer(1, 25 * mm),
              Paragraph("AED 250,000,000 TERM LOAN FACILITY", center), Spacer(1, 4 * mm),
              Paragraph("Facility period 2026–2031", center), PageBreak()]
    # Contents
    story.append(Paragraph("CONTENTS", h1))
    for i, (t, _) in enumerate(CLAUSES, 1):
        story.append(Paragraph(f"{i}.&nbsp;&nbsp;{t}", body))
    story.append(Paragraph("Schedules 1 to 11", body))
    story.append(PageBreak())
    # Parties
    story.append(Paragraph("THIS AGREEMENT is dated 14 March 2026 and made between:", body))
    story.append(Paragraph(f"(1)&nbsp;&nbsp;<b>{PARTIES['borrower']}</b>, a limited liability company incorporated in the Emirate of Dubai with commercial licence number 784512 (the “Borrower”);", sub))
    story.append(Paragraph(f"(2)&nbsp;&nbsp;<b>{PARTIES['guarantor']}</b>, a private company incorporated in the Dubai International Financial Centre with registered number 3317 (the “Guarantor”); and", sub))
    story.append(Paragraph(f"(3)&nbsp;&nbsp;<b>{PARTIES['lender']}</b>, a public joint stock company incorporated in the Emirate of Dubai (the “Lender”).", sub))
    story.append(Paragraph("IT IS AGREED as follows:", body))

    for n, (t, paras) in enumerate(CLAUSES, 1):
        story.append(Paragraph(f"{n}.&nbsp;&nbsp;{t.upper()}", h1))
        if paras is None:  # definitions
            story.append(Paragraph(f"{n}.1&nbsp;&nbsp;In this Agreement:", sub))
            for term, meaning in DEFINITIONS:
                story.append(Paragraph(f"<b>“{term}”</b> means {meaning}", ParagraphStyle(
                    "def", parent=body, leftIndent=12 * mm)))
            interp = padding(n, "interpretation of the Finance Documents", PAD_PER_CLAUSE + 6, rng)
            for i, p in enumerate(interp, 2):
                story.append(Paragraph(f"{n}.{i}&nbsp;&nbsp;{p}", sub))
            continue
        allp = list(paras) + padding(n, t, PAD_PER_CLAUSE, rng)
        for i, p in enumerate(allp, 1):
            story.append(Paragraph(f"{n}.{i}&nbsp;&nbsp;{p}", sub))

    story += schedules(rng)
    doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm,
                          topMargin=22 * mm, bottomMargin=20 * mm,
                          title="Term Facility Agreement (fictional test fixture)",
                          author="Contract Analyzer test fixtures")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame])])
    doc.build(story, canvasmaker=NumberedCanvas)


def schedules(rng):
    s = [PageBreak()]
    W = 166 * mm

    def head(n, t):
        s.append(Paragraph(f"SCHEDULE {n}", h1))
        s.append(Paragraph(t.upper(), h1))

    head(1, "The Original Parties")
    s.append(table([["Role", "Name", "Registered office"],
                    ["Borrower", PARTIES["borrower"], "Office 1407, Al Saqr Business Tower, Sheikh Zayed Road, Dubai"],
                    ["Guarantor", PARTIES["guarantor"], "Unit 22, Level 3, Gate Village 10, DIFC, Dubai"],
                    ["Lender", PARTIES["lender"], "Level 9, Gate Precinct Building 4, DIFC, Dubai"]],
                   [30 * mm, 55 * mm, 81 * mm]))
    s.append(PageBreak())
    head(2, "Conditions Precedent")
    cps = ["A copy of the constitutional documents of each Obligor.",
           "A copy of a resolution of the board of directors of each Obligor approving the terms of, and the transactions contemplated by, the Finance Documents.",
           "A specimen of the signature of each person authorised by the resolutions referred to above.",
           "A certificate of each Obligor confirming that borrowing or guaranteeing the Commitment would not cause any borrowing, guarantee or similar limit binding on it to be exceeded.",
           "A legal opinion of Hadley & Saif Legal Consultants, legal advisers to the Lender, as to the laws of the DIFC.",
           "A legal opinion of Hadley & Saif Legal Consultants as to the laws of the Emirate of Dubai and the federal laws of the UAE.",
           "The mortgage over Plot S-20417, Jebel Ali Free Zone, duly executed and registered with the relevant free zone authority.",
           "The receivables assignment, duly executed, together with notices of assignment acknowledged by each relevant customer.",
           "The account pledge over the collection account, duly executed and registered with the Emirates Movable Collateral Registry.",
           "The Original Financial Statements.",
           "Evidence that the fees, costs and expenses then due from the Borrower under Clause 11 (Fees) and Clause 16 (Costs and Expenses) have been paid.",
           "A valuation report on the mortgaged warehouse prepared by an independent valuer approved by the Lender and dated not earlier than sixty (60) days before the first Utilisation Date.",
           "Evidence that the existing working capital facility referred to in Clause 3 (Purpose) will be repaid in full on the first Utilisation Date.",
           "All information requested by the Lender in order to complete its “know your customer” checks."]
    for i, c in enumerate(cps, 1):
        s.append(Paragraph(f"{i}.&nbsp;&nbsp;{c}", sub))
    for i, p in enumerate(padding(2, "conditions precedent", 8, rng), len(cps) + 1):
        s.append(Paragraph(f"{i}.&nbsp;&nbsp;{p.replace('Clause 2', 'this Schedule 2')}", sub))
    s.append(PageBreak())
    head(3, "Form of Utilisation Request")
    for p in ["From: Al Noor Trading L.L.C.", "To: Gulf Meridian Bank P.J.S.C.", "Dated: [●]",
              "Al Noor Trading L.L.C. – AED 250,000,000 Term Facility Agreement dated 14 March 2026 (the “Agreement”)",
              "1. We refer to the Agreement. This is a Utilisation Request. Terms defined in the Agreement have the same meaning in this Utilisation Request unless given a different meaning in this Utilisation Request.",
              "2. We wish to borrow a Loan on the following terms: Proposed Utilisation Date: [●] (or, if that is not a Business Day, the next Business Day); Amount: AED [●] or, if less, the Available Commitment; Interest Period: three (3) Months.",
              "3. We confirm that each condition specified in Clause 4 (Conditions of Utilisation) is satisfied on the date of this Utilisation Request.",
              "4. The proceeds of this Loan should be credited to account number AE07 0331 2345 6789 0123 456 held with the Account Bank.",
              "5. This Utilisation Request is irrevocable.",
              "Authorised signatory for and on behalf of Al Noor Trading L.L.C."]:
        s.append(Paragraph(p, body))
    s.append(PageBreak())
    head(4, "Form of Transfer Certificate")
    for i, p in enumerate(padding(4, "transfers of participations", 14, rng), 1):
        s.append(Paragraph(f"{i}.&nbsp;&nbsp;{p.replace('Clause 4', 'this Transfer Certificate')}", sub))
    s.append(PageBreak())
    head(5, "Timetables")
    s.append(table([["Event", "Time"],
                    ["Delivery of a duly completed Utilisation Request", "U-3, 11.00 a.m. Dubai time"],
                    ["EIBOR is fixed", "Quotation Day, 11.00 a.m. Dubai time"],
                    ["Lender notifies the Borrower of the rate of interest", "Quotation Day, 2.00 p.m. Dubai time"],
                    ["Funds made available to the Borrower", "U, 12.00 noon Dubai time"]],
                   [110 * mm, 56 * mm]))
    s.append(Paragraph("“U” means the Utilisation Date and “U-X” means X Business Days prior to the Utilisation Date.", body))
    s.append(PageBreak())
    head(6, "Form of Compliance Certificate")
    for p in ["To: Gulf Meridian Bank P.J.S.C.", "From: Al Noor Holdings Limited",
              "1. We refer to the Agreement. This is a Compliance Certificate.",
              "2. We confirm that in respect of the Relevant Period ending on [●]: Leverage was [●]:1 (maximum 3.50:1); Interest Cover was [●]:1 (minimum 4.00:1); and Tangible Net Worth was AED [●] (minimum AED 400,000,000).",
              "3. We confirm that no Default is continuing.",
              "Note for the signatory: " + REPEATED,
              "Signed: Chief Financial Officer, for and on behalf of Al Noor Holdings Limited"]:
        s.append(Paragraph(p, body))
    s.append(PageBreak())
    head(7, "Material Subsidiaries")
    names = ["Al Noor Logistics", "Al Noor Cold Chain", "Desert Rose Freight", "Al Noor Marine Services",
             "Saffron Packaging", "Al Noor Fleet", "Crescent Warehousing", "Al Noor Customs Brokerage",
             "Palm Gate Distribution", "Al Noor Equipment Leasing", "Harbour Line Shipping",
             "Al Noor Property Holdings", "Oryx Last Mile", "Al Noor Technology Services",
             "Sand Dune Trading", "Al Noor Food Distribution", "Gulf Pallet Systems", "Al Noor Free Zone Holdings"]
    rows = [["Name", "Jurisdiction", "Registered number", "Ownership"]]
    for i, nm in enumerate(names):
        rows.append([f"{nm} {'L.L.C.' if i % 3 else 'FZE'}", ["Dubai", "Jebel Ali Free Zone", "Sharjah", "Abu Dhabi"][i % 4],
                     f"{rng.randint(100000, 999999)}", f"{rng.choice([100, 100, 100, 75, 60, 51])} per cent."])
    s.append(table(rows, [62 * mm, 40 * mm, 32 * mm, 32 * mm]))
    s.append(PageBreak())
    head(8, "Repayment Schedule")
    rows = [["Instalment", "Repayment Date", "Amount (AED)", "Outstanding after payment (AED)"]]
    out = 250_000_000
    dates = []
    y, months = 2027, ["31 March", "30 June", "30 September", "31 December"]
    for i in range(20):
        dates.append(f"{months[i % 4]} {y + i // 4}")
    for i, d in enumerate(dates, 1):
        out -= 12_500_000
        rows.append([str(i), d, "12,500,000", f"{out:,}"])
    s.append(table(rows, [25 * mm, 45 * mm, 40 * mm, 56 * mm]))
    s.append(Paragraph("Each instalment is equal to 5 per cent. of the aggregate Loans outstanding at the end of the Availability Period, adjusted pro rata if the Commitment has not been fully drawn.", body))
    s.append(PageBreak())
    head(9, "Existing Security")
    s.append(table([["Member of the Group", "Security", "Secured amount (AED)", "Secured party"],
                    ["Al Noor Fleet L.L.C.", "Chattel mortgage over 42 heavy goods vehicles", "18,400,000", "Coastal Finance P.S.C."],
                    ["Crescent Warehousing FZE", "Mortgage over Plot S-11208, Jebel Ali Free Zone", "27,000,000", "Northern Emirates Bank P.J.S.C."],
                    ["Harbour Line Shipping L.L.C.", "Ship mortgage over the vessel “Al Noor Pearl”", "9,750,000", "Northern Emirates Bank P.J.S.C."]],
                   [44 * mm, 60 * mm, 30 * mm, 32 * mm]))
    s.append(Paragraph("The Security over Plot S-11208 shall be released on or before 30 September 2026.", body))
    s.append(PageBreak())
    head(10, "Insurance Requirements")
    s.append(table([["Risk", "Minimum cover (AED)", "Notes"],
                    ["Property all risks (mortgaged warehouse)", "120,000,000", "Lender as first loss payee"],
                    ["Business interruption", "30,000,000", "Indemnity period 18 Months"],
                    ["Third party liability", "25,000,000", "Any one occurrence"],
                    ["Goods in transit", "15,000,000", "Per conveyance limit AED 2,000,000"],
                    ["Directors' and officers' liability", "20,000,000", "Group-wide policy"]],
                   [70 * mm, 40 * mm, 56 * mm]))
    s.append(PageBreak())
    head(11, "Properties")
    for i, p in enumerate(["Warehouse at Plot S-20417, Jebel Ali Free Zone, Dubai (mortgaged under the Finance Documents).",
                           "Cold store at Plot 598-1120, Al Quoz Industrial Area 3, Dubai.",
                           "Distribution centre at Plot 14, Al Sajaa Industrial Area, Sharjah.",
                           "Office premises at Office 1407, Al Saqr Business Tower, Sheikh Zayed Road, Dubai (leased)."], 1):
        s.append(Paragraph(f"{i}.&nbsp;&nbsp;{p}", sub))
    s.append(PageBreak())
    s.append(Paragraph("SIGNATURES", h1))
    for party in PARTIES.values():
        s.append(Paragraph(f"<b>{party}</b>", body))
        s.append(Paragraph("By: ______________________________&nbsp;&nbsp;&nbsp;Name: [●]&nbsp;&nbsp;&nbsp;Title: Authorised Signatory", body))
        s.append(Spacer(1, 10 * mm))
    return s


if __name__ == "__main__":
    build()
