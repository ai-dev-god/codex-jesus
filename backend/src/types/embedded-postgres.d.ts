declare module 'embedded-postgres' {
  import EmbeddedPostgres from 'embedded-postgres/dist/index.js';
  import type { PostgresOptions } from 'embedded-postgres/dist/types.js';

  export default EmbeddedPostgres;
  export type { PostgresOptions };
}

