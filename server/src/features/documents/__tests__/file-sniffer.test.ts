import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { contentTypeFor, extensionFor, sniffFile } from '../domain/file-sniffer';

/** Builds a real ZIP so the DOCX cases test actual archive bytes, not a hand-faked header. */
async function buildZip(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function oleContainer(streamName: string): Buffer {
  const header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  // OLE2 stores stream names as UTF-16LE, which is how .doc and an encrypted .docx differ.
  return Buffer.concat([header, Buffer.alloc(40), Buffer.from(streamName, 'utf16le')]);
}

describe('sniffFile — accepted types', () => {
  it('accepts a PDF by its magic number', () => {
    expect(sniffFile(Buffer.from('%PDF-1.7\n...rest...', 'latin1'))).toEqual({ kind: 'PDF' });
  });

  it('accepts a DOCX: a ZIP containing word/document.xml', async () => {
    const docx = await buildZip({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': '<w:document/>',
    });
    expect(sniffFile(docx)).toEqual({ kind: 'DOCX' });
  });
});

describe('sniffFile — rejections each get their own reason', () => {
  it('rejects an empty file', () => {
    expect(sniffFile(Buffer.alloc(0))).toEqual({ kind: 'rejected', reason: 'EMPTY_FILE' });
  });

  it('rejects a PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(sniffFile(png)).toEqual({ kind: 'rejected', reason: 'UNSUPPORTED_TYPE' });
  });

  it('rejects a plain text file', () => {
    expect(sniffFile(Buffer.from('This is just a contract in a .txt file.', 'utf8'))).toEqual({
      kind: 'rejected',
      reason: 'UNSUPPORTED_TYPE',
    });
  });

  it('rejects a legacy .doc with its OWN reason, not a generic one', () => {
    // The whole point: "save it as .docx" is only useful advice for this case.
    expect(sniffFile(oleContainer('WordDocument'))).toEqual({
      kind: 'rejected',
      reason: 'LEGACY_DOC_FORMAT',
    });
  });

  it('tells a password-protected .docx apart from a legacy .doc', () => {
    // Both are OLE2 containers. Telling .docx owners to "save as .docx" would be nonsense.
    expect(sniffFile(oleContainer('EncryptedPackage'))).toEqual({
      kind: 'rejected',
      reason: 'ENCRYPTED_DOCX',
    });
  });

  it('rejects some other OLE2 file (.xls, .msg) as unsupported', () => {
    expect(sniffFile(oleContainer('Workbook'))).toEqual({
      kind: 'rejected',
      reason: 'UNSUPPORTED_TYPE',
    });
  });

  it('rejects a ZIP that is not a DOCX (an .xlsx)', async () => {
    const xlsx = await buildZip({
      '[Content_Types].xml': '<Types/>',
      'xl/workbook.xml': '<workbook/>',
    });
    expect(sniffFile(xlsx)).toEqual({ kind: 'rejected', reason: 'UNSUPPORTED_TYPE' });
  });

  it('rejects an empty ZIP archive', () => {
    const emptyZip = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
    expect(sniffFile(emptyZip)).toEqual({ kind: 'rejected', reason: 'UNSUPPORTED_TYPE' });
  });
});

describe('sniffFile — the extension is never trusted', () => {
  it('rejects an executable renamed to .pdf', () => {
    // MZ header: a Windows executable. The filename is irrelevant here by design.
    const exe = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(64, 0x90)]);
    expect(sniffFile(exe)).toEqual({ kind: 'rejected', reason: 'UNSUPPORTED_TYPE' });
  });

  it('accepts a real PDF whatever it is called', () => {
    expect(sniffFile(Buffer.from('%PDF-1.4 ...', 'latin1')).kind).toBe('PDF');
  });

  it('does not accept a file that merely mentions PDF later on', () => {
    expect(sniffFile(Buffer.from('this file talks about %PDF- somewhere', 'utf8'))).toEqual({
      kind: 'rejected',
      reason: 'UNSUPPORTED_TYPE',
    });
  });
});

describe('sniffFile — short and odd buffers do not crash', () => {
  it.each([1, 2, 3, 4, 5, 7, 8])('handles a %i-byte buffer', (size) => {
    expect(() => sniffFile(Buffer.alloc(size))).not.toThrow();
  });

  it('handles a truncated PDF magic number', () => {
    expect(sniffFile(Buffer.from('%PDF', 'latin1'))).toEqual({
      kind: 'rejected',
      reason: 'UNSUPPORTED_TYPE',
    });
  });
});

describe('sniffFile — finds the entry name in a large archive', () => {
  it('accepts a DOCX whose document.xml sits past the head window', async () => {
    // Pushes word/document.xml well beyond the 64 KB head scan, so only the central-directory
    // (tail) scan can find it. A 150-page contract looks like this.
    const docx = await buildZip({
      '[Content_Types].xml': '<Types/>',
      'word/media/image1.png': 'x'.repeat(300_000),
      'word/document.xml': '<w:document/>',
    });
    expect(docx.length).toBeGreaterThan(64 * 1024);
    expect(sniffFile(docx)).toEqual({ kind: 'DOCX' });
  });
});

describe('extensionFor / contentTypeFor', () => {
  it('maps the two accepted kinds', () => {
    expect(extensionFor('PDF')).toBe('pdf');
    expect(extensionFor('DOCX')).toBe('docx');
    expect(contentTypeFor('PDF')).toBe('application/pdf');
    expect(contentTypeFor('DOCX')).toContain('wordprocessingml.document');
  });
});
