/**
 * Decides what a file actually is, from its BYTES — never its extension or the
 * Content-Type the browser claimed (ARCHITECTURE section 4).
 *
 * The assignment asks for a renamed `.exe` to be rejected and for an old `.doc` to get its own
 * message rather than a generic "unsupported". Extensions cannot do either, so everything here
 * works from magic numbers and, where that is not enough, from names visible in the container.
 *
 * Pure: no I/O, no framework. The caller turns a verdict into an AppError.
 */

export type SniffVerdict =
  | { kind: 'PDF' }
  | { kind: 'DOCX' }
  | { kind: 'rejected'; reason: SniffRejection };

/** Each reason maps to its own user-facing message, which is the point of distinguishing them. */
export type SniffRejection =
  | 'EMPTY_FILE'
  | 'LEGACY_DOC_FORMAT'
  | 'ENCRYPTED_DOCX'
  | 'UNSUPPORTED_TYPE';

const PDF_MAGIC = '%PDF-';
/** Local file header of any ZIP — a DOCX is a ZIP. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** An empty ZIP ("PK\x05\x06") is a valid archive with no entries, so it is not a DOCX. */
const ZIP_EMPTY_MAGIC = [0x50, 0x4b, 0x05, 0x06];
/** OLE2 compound file: a legacy .doc, or an OOXML file encrypted by Word. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * How far into the file we look for an entry name.
 *
 * `word/document.xml` appears as a plain-ASCII filename in the ZIP's local headers and central
 * directory. Reading the whole buffer would be correct but wasteful on a 25 MB file, and the
 * first entry of a Word-produced DOCX is near the start; the central directory at the END is
 * also checked, which is what makes this reliable regardless of entry order.
 */
const SCAN_WINDOW_BYTES = 64 * 1024;

export function sniffFile(buffer: Buffer): SniffVerdict {
  if (buffer.length === 0) {
    return { kind: 'rejected', reason: 'EMPTY_FILE' };
  }

  if (startsWithAscii(buffer, PDF_MAGIC)) {
    return { kind: 'PDF' };
  }

  if (startsWithBytes(buffer, ZIP_MAGIC)) {
    // A ZIP on its own is not enough: .xlsx, .pptx, .jar and .zip all look identical here.
    return containsAscii(buffer, 'word/document.xml')
      ? { kind: 'DOCX' }
      : { kind: 'rejected', reason: 'UNSUPPORTED_TYPE' };
  }

  if (startsWithBytes(buffer, ZIP_EMPTY_MAGIC)) {
    return { kind: 'rejected', reason: 'UNSUPPORTED_TYPE' };
  }

  if (startsWithBytes(buffer, OLE2_MAGIC)) {
    /**
     * Both a legacy .doc and a password-protected .docx are OLE2 containers, and they need
     * different messages — "save as .docx" is useless advice for a file that already is one.
     * They are told apart by their stream names, which OLE2 stores as UTF-16LE.
     */
    if (containsUtf16(buffer, 'EncryptedPackage')) {
      return { kind: 'rejected', reason: 'ENCRYPTED_DOCX' };
    }
    if (containsUtf16(buffer, 'WordDocument')) {
      return { kind: 'rejected', reason: 'LEGACY_DOC_FORMAT' };
    }
    // Some other OLE2 file (.xls, .ppt, .msg).
    return { kind: 'rejected', reason: 'UNSUPPORTED_TYPE' };
  }

  return { kind: 'rejected', reason: 'UNSUPPORTED_TYPE' };
}

/** The extension for a verdict, used only to build the storage key. */
export function extensionFor(kind: 'PDF' | 'DOCX'): 'pdf' | 'docx' {
  return kind === 'PDF' ? 'pdf' : 'docx';
}

export function contentTypeFor(kind: 'PDF' | 'DOCX'): string {
  return kind === 'PDF'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function startsWithAscii(buffer: Buffer, prefix: string): boolean {
  if (buffer.length < prefix.length) return false;
  return buffer.subarray(0, prefix.length).toString('latin1') === prefix;
}

function startsWithBytes(buffer: Buffer, magic: readonly number[]): boolean {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, index) => buffer[index] === byte);
}

/** Searches the head and the tail, so entry order in the archive does not matter. */
function containsAscii(buffer: Buffer, needle: string): boolean {
  const target = Buffer.from(needle, 'latin1');
  if (buffer.length <= SCAN_WINDOW_BYTES * 2) {
    return buffer.includes(target);
  }
  return (
    buffer.subarray(0, SCAN_WINDOW_BYTES).includes(target) ||
    buffer.subarray(buffer.length - SCAN_WINDOW_BYTES).includes(target)
  );
}

function containsUtf16(buffer: Buffer, needle: string): boolean {
  const target = Buffer.from(needle, 'utf16le');
  const window =
    buffer.length <= SCAN_WINDOW_BYTES ? buffer : buffer.subarray(0, SCAN_WINDOW_BYTES);
  return window.includes(target);
}
