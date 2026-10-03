import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { AppError } from '../../../core/errors/app-error';

export interface LoadedDocx {
  zip: JSZip;
  docXml: Document;
  rawXml: string;
}

export async function loadDocx(buffer: Buffer): Promise<LoadedDocx> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (_error) {
    throw AppError.badRequest('CORRUPT_FILE', 'The DOCX file could not be unpacked.');
  }

  const file = zip.file('word/document.xml');
  if (!file) {
    throw AppError.badRequest('CORRUPT_FILE', 'DOCX does not contain word/document.xml.');
  }

  const rawXml = await file.async('text');
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (e) => {
        throw new Error(`XML Parse error: ${e}`);
      },
      fatalError: (e) => {
        throw new Error(`XML Fatal error: ${e}`);
      },
    },
  });

  const docXml = parser.parseFromString(rawXml, 'application/xml');
  return { zip, docXml, rawXml };
}

export async function saveDocx(zip: JSZip, docXml: Document): Promise<Buffer> {
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(docXml);
  zip.file('word/document.xml', newXml);
  const outBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return outBuf;
}
