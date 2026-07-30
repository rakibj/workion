import { TokenService } from '../../core/auth/services/token.service';
import { isAttachmentNode } from './prosemirror/attachment-node-types';
import { updateAttachmentAttr } from '../../core/share/share.util';
import { validate as isValidUUID } from 'uuid';

/** Prepares page content for an anonymous reader without exposing comments. */
export async function prepareContentForPublic(
  content: unknown,
  attachmentOwnerPageId: string,
  workspaceId: string,
  tokenService: TokenService,
): Promise<any> {
  const doc = JSON.parse(
    JSON.stringify(
      content ?? {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { textAlign: 'left' } }],
      },
    ),
  );
  const attachmentIds = new Set<string>();
  const visit = (node: any) => {
    if (isAttachmentNode(node?.type) && isValidUUID(node.attrs?.attachmentId)) {
      attachmentIds.add(node.attrs.attachmentId);
    }
    if (Array.isArray(node?.content)) node.content.forEach(visit);
  };
  visit(doc);
  const tokenMap = new Map<string, string>();

  await Promise.all(
    [...attachmentIds].map(async (attachmentId) => {
      tokenMap.set(
        attachmentId,
        await tokenService.generateAttachmentToken({
          attachmentId,
          pageId: attachmentOwnerPageId,
          workspaceId,
        }),
      );
    }),
  );

  const rewrite = (node: any) => {
    if (isAttachmentNode(node?.type)) {
      const token = tokenMap.get(node.attrs.attachmentId);
      if (token) {
        updateAttachmentAttr(node, 'src', token);
        updateAttachmentAttr(node, 'url', token);
      }
    }
    if (Array.isArray(node?.marks))
      node.marks = node.marks.filter((mark: any) => mark.type !== 'comment');
    if (Array.isArray(node?.content)) node.content.forEach(rewrite);
  };
  rewrite(doc);

  return doc;
}

/**
 * Prepares blog post content for public serving. Unlike prepareContentForPublic,
 * attachment URLs are rewritten to the stable /files/blog/ route (access checked
 * live against publish state) rather than a short-lived signed token, since blog
 * HTML is expected to be cached by external consumers beyond a token's lifetime.
 */
export function prepareContentForBlog(content: unknown): any {
  const doc = JSON.parse(
    JSON.stringify(
      content ?? {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { textAlign: 'left' } }],
      },
    ),
  );

  const rewriteAttr = (node: any, attr: 'src' | 'url') => {
    const attrVal = node.attrs?.[attr];
    if (
      attrVal &&
      (attrVal.startsWith('/files') || attrVal.startsWith('/api/files'))
    ) {
      node.attrs[attr] = attrVal.replace('/files/', '/files/blog/');
    }
  };

  const rewrite = (node: any) => {
    if (isAttachmentNode(node?.type)) {
      rewriteAttr(node, 'src');
      rewriteAttr(node, 'url');
    }
    if (Array.isArray(node?.marks))
      node.marks = node.marks.filter((mark: any) => mark.type !== 'comment');
    if (Array.isArray(node?.content)) node.content.forEach(rewrite);
  };
  rewrite(doc);

  return doc;
}
