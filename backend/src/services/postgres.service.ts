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

  /**
   * Busca una conversación por número de celular, o la crea si no existe
   * @param celular Número de teléfono con formato +573001234567
   * @param nombrePaciente Nombre del paciente (opcional)
   * @returns ID de la conversación
   */
  async getOrCreateConversacion(celular: string, nombrePaciente?: string): Promise<number | null> {
    const client = await this.getClient();
    if (!client) return null;

    try {
      // Buscar conversación existente
      const searchResult = await client.query(
        'SELECT id FROM conversaciones_whatsapp WHERE celular = $1',
        [celular]
      );

      if (searchResult.rows.length > 0) {
        // Actualizar fecha de última actividad
        await client.query(
          'UPDATE conversaciones_whatsapp SET fecha_ultima_actividad = NOW() WHERE id = $1',
          [searchResult.rows[0].id]
        );
        return searchResult.rows[0].id;
      }

      // Crear nueva conversación
      const insertResult = await client.query(
        `INSERT INTO conversaciones_whatsapp (celular, nombre_paciente, origen, estado, canal, estado_actual)
         VALUES ($1, $2, 'BSL-CONSULTAVIDEO', 'nueva', 'bot', 'inicio')
         RETURNING id`,
        [celular, nombrePaciente || null]
      );

      console.log(`✅ [PostgreSQL] Nueva conversación creada para ${celular} con ID: ${insertResult.rows[0].id}`);
      return insertResult.rows[0].id;
    } catch (error) {
      console.error('❌ [PostgreSQL] Error buscando/creando conversación:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Registra un mensaje de WhatsApp saliente en la base de datos
   * @param celular Número de teléfono con formato +573001234567
   * @param contenido Contenido del mensaje
   * @param sidTwilio SID del mensaje de Twilio
   * @param nombrePaciente Nombre del paciente (opcional)
   * @returns true si se registró correctamente
   */
  async registrarMensajeSaliente(
    celular: string,
    contenido: string,
    sidTwilio: string,
    nombrePaciente?: string
  ): Promise<boolean> {
    const client = await this.getClient();
    if (!client) return false;

    try {
      // Obtener o crear conversación
      const conversacionId = await this.getOrCreateConversacion(celular, nombrePaciente);

      if (!conversacionId) {
        console.error('❌ [PostgreSQL] No se pudo obtener/crear la conversación');
        return false;
      }

      // Insertar mensaje
      await client.query(
        `INSERT INTO mensajes_whatsapp
         (conversacion_id, direccion, contenido, tipo_mensaje, sid_twilio, leido_por_agente)
         VALUES ($1, 'saliente', $2, 'text', $3, true)`,
        [conversacionId, contenido, sidTwilio]
      );

      console.log(`✅ [PostgreSQL] Mensaje registrado para ${celular} (conversacion_id: ${conversacionId})`);
      return true;
    } catch (error: any) {
      // Si el error es por SID duplicado, ignorarlo (mensaje ya registrado)
      if (error.code === '23505' && error.constraint === 'idx_mensajes_sid_twilio_unique') {
        console.log(`ℹ️ [PostgreSQL] Mensaje con SID ${sidTwilio} ya existe en la base de datos`);
        return true;
      }
      console.error('❌ [PostgreSQL] Error registrando mensaje:', error);
      return false;
    } finally {
      client.release();
    }
  }
}

export default new PostgresService();
