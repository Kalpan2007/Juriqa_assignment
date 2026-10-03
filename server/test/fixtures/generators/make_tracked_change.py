"""Creates 14-msa-v1-with-existing-tracked-change.docx: MSA v1 plus one tracked insertion."""
import shutil, tempfile, zipfile, os

SRC, DST = "out/10-msa-v1.docx", "out/14-msa-v1-with-existing-tracked-change.docx"
RPR = ('<w:rPr><w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" '
       'w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>')
SENT = "Each party warrants that it has full capacity and authority to enter into and perform this Agreement"
OLD = f'<w:r>{RPR}<w:t xml:space="preserve">{SENT}.</w:t></w:r>'
NEW = (f'<w:r>{RPR}<w:t xml:space="preserve">{SENT}</w:t></w:r>'
       f'<w:ins w:id="9001" w:author="Oasis Legal" w:date="2026-02-10T09:30:00Z"><w:r>{RPR}'
       f'<w:t xml:space="preserve"> and that this Agreement has been duly authorised by its board of directors</w:t></w:r></w:ins>'
       f'<w:r>{RPR}<w:t>.</w:t></w:r>')

with tempfile.TemporaryDirectory() as d:
    zipfile.ZipFile(SRC).extractall(d)
    p = os.path.join(d, "word/document.xml")
    xml = open(p, encoding="utf-8").read()
    assert xml.count(OLD) == 1, "warranty sentence not found exactly once"
    open(p, "w", encoding="utf-8").write(xml.replace(OLD, NEW))
    with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(d):
            for f in files:
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, d))
print("written", DST)
