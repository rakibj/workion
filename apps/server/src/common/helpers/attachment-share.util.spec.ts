import { prepareContentForBlog } from './attachment-share.util';

describe('prepareContentForBlog', () => {
  it('rewrites an editor-authored /api/files/ src to the stable blog route', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            attachmentId: 'att-1',
            src: '/api/files/att-1/photo.png',
          },
        },
      ],
    };
    const result = prepareContentForBlog(doc);
    expect(result.content[0].attrs.src).toBe('/api/files/blog/att-1/photo.png');
  });

  it('rewrites a bare /files/ src (imported/migrated content) to include /api', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            attachmentId: 'att-1',
            src: '/files/att-1/photo.png',
          },
        },
      ],
    };
    const result = prepareContentForBlog(doc);
    expect(result.content[0].attrs.src).toBe('/api/files/blog/att-1/photo.png');
  });

  it('leaves unrelated src/url values untouched', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://example.com/external.png' } },
      ],
    };
    const result = prepareContentForBlog(doc);
    expect(result.content[0].attrs.src).toBe('https://example.com/external.png');
  });

  it('strips comment marks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'hi',
              marks: [{ type: 'comment' }, { type: 'bold' }],
            },
          ],
        },
      ],
    };
    const result = prepareContentForBlog(doc);
    expect(result.content[0].content[0].marks).toEqual([{ type: 'bold' }]);
  });
});
