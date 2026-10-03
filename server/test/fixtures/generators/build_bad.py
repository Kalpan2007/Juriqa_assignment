"""Builds the 'problem' fixtures: scans, encryption, corruption, wrong types, too many pages."""
import io, os, random, subprocess, tempfile
from PIL import Image, ImageFilter, ImageOps
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import msoffcrypto

OUT = "out/"
rng = random.Random(7)


def render_pages(pdf, first, last, dpi=110):
    """Render PDF pages to PIL images that look like a photocopy scan."""
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["pdftoppm", "-r", str(dpi), "-gray", "-f", str(first), "-l", str(last),
                        "-png", pdf, f"{d}/p"], check=True)
        imgs = []
        for f in sorted(os.listdir(d)):
            im = Image.open(f"{d}/{f}").convert("L")
            im = im.rotate(rng.uniform(-0.8, 0.8), expand=False, fillcolor=255)
            noise = Image.effect_noise(im.size, 18).convert("L")
            im = Image.blend(im, noise, 0.06).filter(ImageFilter.GaussianBlur(0.4))
            im = ImageOps.autocontrast(im)
            imgs.append(im)
        return imgs


def image_pdf_page(img):
    """One-page, image-only PDF (no text layer) as a PdfReader page."""
    buf = io.BytesIO()
    img.save(buf, "PDF", resolution=110)
    return PdfReader(io.BytesIO(buf.getvalue())).pages[0]


# 30: fully scanned (MSA v1, all pages are images, zero text)
imgs = render_pages(OUT + "10-msa-v1.pdf", 1, 99)
imgs[0].save(OUT + "30-scanned-full.pdf", "PDF", resolution=110, save_all=True, append_images=imgs[1:])

# 31: partially scanned (first 30 pages of the facility agreement; pages 12-14 replaced by scans)
src = PdfReader(OUT + "01-facility-agreement-162p.pdf")
scans = render_pages(OUT + "01-facility-agreement-162p.pdf", 12, 14)
w = PdfWriter()
for i in range(30):
    w.add_page(image_pdf_page(scans[i - 11]) if 11 <= i <= 13 else src.pages[i])
with open(OUT + "31-scanned-partial-pages-12-14.pdf", "wb") as f:
    w.write(f)

# 32: password protected PDF
w = PdfWriter(clone_from=OUT + "10-msa-v1.pdf")
w.encrypt(user_password="juriqa-test", owner_password="juriqa-owner", algorithm="AES-256")
with open(OUT + "32-password-protected.pdf", "wb") as f:
    w.write(f)

# 33: corrupt PDF (cut off half way)
data = open(OUT + "20-nda-mutual.pdf", "rb").read()
open(OUT + "33-corrupt-truncated.pdf", "wb").write(data[: len(data) // 2])

# 34: a text file pretending to be a PDF
open(OUT + "34-fake-pdf-actually-text.pdf", "w").write(
    "This is a plain text file that has been renamed to .pdf.\nIt does not start with %PDF-.\n")

# 35: empty file
open(OUT + "35-empty.pdf", "wb").close()

# 37: password-protected DOCX (Office encryption = OLE container, not a ZIP)
with open(OUT + "21-lease-marina-plaza.docx", "rb") as fin, open(OUT + "37-password-protected.docx", "wb") as fout:
    of = msoffcrypto.OfficeFile(fin)
    of.encrypt("juriqa-test", fout)

# 38: an image of a contract page
render_pages(OUT + "20-nda-mutual.pdf", 1, 1)[0].save(OUT + "38-contract-photo.png")

# 39: plain text notes
open(OUT + "39-meeting-notes.txt", "w").write(
    "Notes from call with Oasis Retail, 3 Feb 2026:\n- wants liability cap raised\n- prefers ADGM law\n")

# 40: more than MAX_PAGES (300)
c = canvas.Canvas(OUT + "40-too-many-pages-320p.pdf", pagesize=A4)
for p in range(1, 321):
    c.setFont("Helvetica", 11)
    c.drawString(72, 760, f"Annex A - Price list, page {p} of 320")
    c.drawString(72, 740, f"Item {p:04d}: Standard pallet storage, AED {40 + p % 17}.00 per pallet per week.")
    c.showPage()
c.save()
print("done")
