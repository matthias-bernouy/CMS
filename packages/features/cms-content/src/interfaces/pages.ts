export type TPage = {
  id: string;
  /** path is unique */
  path: string;
  content: string;
  title: string;
  description: string;
  visible: boolean;
  tags: string[];
}

/**
 * Reference to a specific page by its primary key. `null` means "not set".
 */
export type TPageRef = { path: string } | null;
