import { computeEmailSignature, verifyEmailSignature } from './auth.util';

describe('verifyEmailSignature', () => {
  const email = 'jane@acme.com';
  const workspaceId = 'ws-1';
  const appSecret = 'test-secret';

  it('accepts a signature produced by computeEmailSignature for the same inputs', () => {
    const sig = computeEmailSignature(email, workspaceId, appSecret);
    expect(verifyEmailSignature(email, workspaceId, sig, appSecret)).toBe(true);
  });

  it('rejects a signature computed with a different app secret', () => {
    const sig = computeEmailSignature(email, workspaceId, 'wrong-secret');
    expect(verifyEmailSignature(email, workspaceId, sig, appSecret)).toBe(false);
  });

  it('rejects a signature for a different workspace (cross-tenant replay)', () => {
    const sig = computeEmailSignature(email, 'ws-OTHER', appSecret);
    expect(verifyEmailSignature(email, workspaceId, sig, appSecret)).toBe(false);
  });

  it('rejects a malformed/empty signature without throwing', () => {
    expect(verifyEmailSignature(email, workspaceId, '', appSecret)).toBe(false);
    expect(verifyEmailSignature(email, workspaceId, 'not-hex-!!', appSecret)).toBe(
      false,
    );
  });
});
