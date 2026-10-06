import type { McpToolName } from './mcpTools.ts';

/**
 * Human titles and behaviour hints for every MCP tool.
 * Directories (Claude, ChatGPT, the official registry) read these.
 * destructiveHint is true when the call can remove data the person had.
 * Completing a task is reversible, so it is not destructive.
 * openWorldHint is true when the call reaches outside Trove (an email, or a
 * download from a URL the caller supplies).
 */
export type ToolMetadata = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export const SERVER_VERSION = '1.1.1';

export const toolMetadata: Record<McpToolName, ToolMetadata> = {
  list_circles: {
    title: 'List circles',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  get_circle: {
    title: 'Get a circle',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  create_circle: {
    title: 'Create a circle',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  list_my_tasks: {
    title: 'List my tasks',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  list_circle_tasks: {
    title: 'List circle tasks',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  create_task: {
    title: 'Create a task',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  create_tasks_bulk: {
    title: 'Create tasks in bulk',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  update_task: {
    title: 'Update a task',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  complete_task: {
    title: 'Complete a task',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  assign_task: {
    title: 'Assign a task',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  move_task: {
    title: 'Move a task',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  add_task_attachment: {
    title: 'Attach a file',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  list_members: {
    title: 'List members',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  invite_to_circle: {
    title: 'Invite to a circle',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export type McpIcon = {
  src: string;
  mimeType: 'image/png';
  sizes: string[];
};

export type McpImplementation = {
  name: 'trove';
  title: 'Trove';
  version: string;
  description: string;
  websiteUrl: string;
  icons: McpIcon[];
};

/** Server card advertised on initialize. Icons live on the public website. */
export function mcpImplementation(siteUrl: string, version: string = SERVER_VERSION): McpImplementation {
  const site = siteUrl.replace(/\/$/, '');
  return {
    name: 'trove',
    title: 'Trove',
    version,
    description: 'Shared lists for the circles you belong to.',
    websiteUrl: site,
    icons: [
      { src: `${site}/apple-touch-icon.png`, mimeType: 'image/png', sizes: ['180x180'] },
      { src: `${site}/mark.png`, mimeType: 'image/png', sizes: ['160x160'] },
    ],
  };
}
