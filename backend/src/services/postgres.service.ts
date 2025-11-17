import { Pool, PoolClient } from 'pg';

/**
 * Servicio de conexión a PostgreSQL
 * Maneja la conexión y queries a la base de datos PostgreSQL de Digital Ocean
 */
class PostgresService {
  private pool: Pool | null = null;

  constructor() {
    this.initializePool();
  }

  /**
   * Inicializa el pool de conexiones a PostgreSQL
   */
  private initializePool(): void {
    try {
      this.pool = new Pool({
        user: process.env.POSTGRES_USER || 'doadmin',
        password: process.env.POSTGRES_PASSWORD,
        host: process.env.POSTGRES_HOST || 'bslpostgres-do-user-19197755-0.k.db.ondigitalocean.com',
        port: parseInt(process.env.POSTGRES_PORT || '25060'),
        database: process.env.POSTGRES_DATABASE || 'defaultdb',
        ssl: {
          rejectUnauthorized: false, // Digital Ocean requires SSL
        },
        max: 20, // Máximo de conexiones en el pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err) => {
        console.error('❌ [PostgreSQL] Error inesperado en el pool:', err);
      });

      console.log('✅ [PostgreSQL] Pool de conexiones inicializado');
    } catch (error) {
      console.error('❌ [PostgreSQL] Error inicializando pool:', error);
      this.pool = null;
    }
  }

  /**
   * Obtiene un cliente del pool
   */
  async getClient(): Promise<PoolClient | null> {
    if (!this.pool) {
      console.error('❌ [PostgreSQL] Pool no inicializado');
      return null;
    }

    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      console.error('❌ [PostgreSQL] Error obteniendo cliente:', error);
      return null;
    }
  }

  /**
   * Ejecuta una query y retorna los resultados
   */
  async query(text: string, params?: any[]): Promise<any[] | null> {
    const client = await this.getClient();
    if (!client) return null;

    try {
      const result = await client.query(text, params);
      return result.rows;
    } catch (error) {
      console.error('❌ [PostgreSQL] Error ejecutando query:', error);
      console.error('Query:', text);
      console.error('Params:', params);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Cierra el pool de conexiones (para cleanup)
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ [PostgreSQL] Pool de conexiones cerrado');
    }
  }

  /**
   * Verifica la conectividad con la base de datos
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      if (result && result.length > 0) {
        console.log('✅ [PostgreSQL] Conexión exitosa');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ [PostgreSQL] Error de conexión:', error);
      return false;
    }
  }
}

export default new PostgresService();
