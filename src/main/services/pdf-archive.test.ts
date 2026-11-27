import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { MAX_PAGE_PIXELS, PdfArchive, pageRenderScale } from './pdf-archive';

/** Builds a minimal but valid single-page PDF (one Helvetica text run), no external tooling needed. */
function buildTestPdf(pageTexts: string[]): string {
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pageTexts.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`);
  pageTexts.forEach((text) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << /Font << /F1 ${3 + pageTexts.length * 2} 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
    );
    const stream = `BT /F1 24 Tf 20 150 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

describe('PdfArchive', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('opens a PDF and reports one page per page count', async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-pdf-'));
    const filePath = join(dir, 'book.pdf');
    await writeFile(filePath, buildTestPdf(['Page One', 'Page Two', 'Page Three']), 'latin1');

    const archive = await PdfArchive.open(filePath);
    try {
      expect(archive.pages).toHaveLength(3);
      expect(archive.fileCount).toBe(3);
    } finally {
      await archive.close();
    }
  });

  it('renders a page to a PNG image', async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-pdf-'));
    const filePath = join(dir, 'book.pdf');
    await writeFile(filePath, buildTestPdf(['Hello PDF']), 'latin1');

    const archive = await PdfArchive.open(filePath);
    try {
      const page = await archive.readPage(0);
      expect(page.mimeType).toBe('image/png');
      expect(Array.from(page.data.slice(0, 4))).toEqual(PNG_MAGIC);
    } finally {
      await archive.close();
    }
  });

  it('serves a page it already rendered from its cache', async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-pdf-'));
    const filePath = join(dir, 'book.pdf');
    await writeFile(filePath, buildTestPdf(['One', 'Two', 'Three']), 'latin1');

    const archive = await PdfArchive.open(filePath);
    try {
      const first = await archive.readPage(1);
      expect(await archive.readPage(1)).toBe(first);
      // The neighbours were rendered in the background: reading them keeps working.
      expect(Array.from((await archive.readPage(2)).data.slice(0, 4))).toEqual(PNG_MAGIC);
      expect(Array.from((await archive.readPage(0)).data.slice(0, 4))).toEqual(PNG_MAGIC);
    } finally {
      await archive.close();
    }
  });

  it('rejects an out-of-range page index', async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-pdf-'));
    const filePath = join(dir, 'book.pdf');
    await writeFile(filePath, buildTestPdf(['Only Page']), 'latin1');

    const archive = await PdfArchive.open(filePath);
    try {
      await expect(archive.readPage(1)).rejects.toThrow(RangeError);
    } finally {
      await archive.close();
    }
  });
});

describe('pageRenderScale', () => {
  it('keeps the ~200 DPI scale for a normal page', () => {
    expect(pageRenderScale(595, 842)).toBeCloseTo(200 / 72);
  });

  it('lowers the scale so a huge page stays within the pixel ceiling', () => {
    const scale = pageRenderScale(4000, 4000);
    expect(scale).toBeLessThan(200 / 72);
    expect(4000 * scale * 4000 * scale).toBeLessThanOrEqual(MAX_PAGE_PIXELS * 1.0001);
  });

  it('falls back to the default scale for a degenerate page', () => {
    expect(pageRenderScale(0, 0)).toBeCloseTo(200 / 72);
  });
});
