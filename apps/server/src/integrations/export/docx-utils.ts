import { load, CheerioAPI } from 'cheerio';
import { Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import * as katex from 'katex';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const HTMLtoDOCX = require('html-to-docx');

const logger = new Logger('DocxUtils');

export async function preprocessHtmlForDocx(
  html: string,
  storageService: StorageService,
  db: KyselyDB,
): Promise<string> {
  const $ = load(html);

  await inlineImages($, storageService, db);
  convertMath($);
  convertCallouts($);
  unwrapColumns($);
  unwrapAttachments($);
  stripUnrenderableNodes($);
  stripDataAttrs($);

  return $.html();
}

export async function htmlToDocxBuffer(
  html: string,
  title: string,
): Promise<Buffer> {
  return HTMLtoDOCX(html, null, {
    orientation: 'portrait',
    title,
  });
}

async function inlineImages(
  $: CheerioAPI,
  storageService: StorageService,
  db: KyselyDB,
): Promise<void> {
  const imgs = $('img').toArray();

  await Promise.all(
    imgs.map(async (el) => {
      const src = $(el).attr('src') || '';
      if (!src.startsWith('/api/files/') && !src.startsWith('/files/')) return;

      const attachmentId =
        $(el).attr('data-attachment-id') ||
        $(el).attr('data-id') ||
        extractAttachmentIdFromUrl(src);

      if (!attachmentId) return;

      try {
        const attachment = await db
          .selectFrom('attachments')
          .select(['filePath', 'mimeType'])
          .where('id', '=', attachmentId)
          .executeTakeFirst();

        if (!attachment) return;

        const buffer = await storageService.read(attachment.filePath);
        const mime = attachment.mimeType || 'image/png';
        $(el).attr('src', `data:${mime};base64,${buffer.toString('base64')}`);
      } catch (err) {
        logger.warn(
          `Could not inline attachment ${attachmentId}: ${(err as Error).message}`,
        );
      }
    }),
  );
}

function extractAttachmentIdFromUrl(url: string): string | null {
  const match = url.match(/\/(?:api\/)?files\/([0-9a-f-]{8,})/i);
  return match ? match[1] : null;
}

function convertMath($: CheerioAPI): void {
  $('[data-type="mathBlock"]').each((_, el) => {
    const latex = $(el).text().trim();
    try {
      const rendered = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
      });
      $(el).replaceWith(`<p>${rendered}</p>`);
    } catch {
      $(el).replaceWith(`<p><code>${latex}</code></p>`);
    }
  });

  $('[data-type="mathInline"]').each((_, el) => {
    const latex = $(el).text().trim();
    try {
      const rendered = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
      $(el).replaceWith(`<span>${rendered}</span>`);
    } catch {
      $(el).replaceWith(`<code>${latex}</code>`);
    }
  });
}

function convertCallouts($: CheerioAPI): void {
  $('[data-type="callout"]').each((_, el) => {
    const inner = $(el).html() || '';
    $(el).replaceWith(
      `<blockquote style="border-left:4px solid #888; padding:8px 12px; background:#f5f5f5; margin:8px 0">${inner}</blockquote>`,
    );
  });
}

function unwrapColumns($: CheerioAPI): void {
  $('[data-type="column"]').each((_, el) => {
    $(el).replaceWith($(el).html() || '');
  });
  $('[data-type="columns"]').each((_, el) => {
    $(el).replaceWith($(el).html() || '');
  });
}

function unwrapAttachments($: CheerioAPI): void {
  $('[data-type="attachment"]').each((_, el) => {
    const link = $(el).find('a').first();
    if (link.length) {
      $(el).replaceWith(link);
    } else {
      $(el).replaceWith($(el).html() || '');
    }
  });
}

function stripUnrenderableNodes($: CheerioAPI): void {
  $(
    '[data-type="subpages"], [data-type="transclusionReference"], [data-type="transclusionSource"]',
  ).remove();
}

function stripDataAttrs($: CheerioAPI): void {
  $('*').each((_, el) => {
    const attribs = (el as any).attribs || {};
    for (const attr of Object.keys(attribs)) {
      if (attr === 'data-type' || attr === 'data-katex' || attr === 'data-id') {
        $(el).removeAttr(attr);
      }
    }
  });
}
