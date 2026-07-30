export enum AttachmentType {
  Avatar = 'avatar',
  WorkspaceIcon = 'workspace-icon',
  SpaceIcon = 'space-icon',
  File = 'file',
  Chat = 'chat',
}

export const validImageExtensions = ['.jpg', '.png', '.jpeg', '.gif'];
export const MAX_AVATAR_SIZE = '10MB';
export const MAX_GIF_SIZE_BYTES = 5 * 1024 * 1024;

export const inlineFileExtensions = [
  '.jpg',
  '.png',
  '.jpeg',
  '.gif',
  '.pdf',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.webm',
];
