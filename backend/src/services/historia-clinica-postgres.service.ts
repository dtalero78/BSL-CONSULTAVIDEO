import postgresService from './postgres.service';

interface HistoriaClinicaData {
  _id: string;
  numeroId: string;
  primerNombre: string;
  segundoNombre?: string;
  primerApellido: string;
  segundoApellido?: string;
  celular: string;
  email?: string;
  fechaNacimiento?: Date;
  edad?: number;
  genero?: string;
  estadoCivil?: string;
  hijos?: string;
  ejercicio?: string;
  codEmpresa?: string;
  empresa?: string;
  cargo?: string;
  tipoExamen?: string;
  encuestaSalud?: string;
  antecedentesFamiliares?: string;
  empresa1?: string;
  mdAntecedentes?: string;
  mdObsParaMiDocYa?: string;
  mdObservacionesCertificado?: string;
  mdRecomendacionesMedicasAdicionales?: string;
  mdConceptoFinal?: string;
  mdDx1?: string;
  mdDx2?: string;
  talla?: string;
  peso?: string;
  motivoConsulta?: string;
  diagnostico?: string;
  tratamiento?: string;
  fechaAtencion?: Date;
  fechaConsulta?: Date;
  atendido?: string;
  pvEstado?: string;
  medico?: string;
}

/**
 * Servicio para manejar operaciones de HistoriaClinica en PostgreSQL
 */
class HistoriaClinicaPostgresService {
  /**
   * Inserta o actualiza (UPSERT) una historia clínica
   * Si el _id ya existe, actualiza; si no, inserta
   */
  async upsert(data: HistoriaClinicaData): Promise<boolean> {
    try {
      const query = `
        INSERT INTO "HistoriaClinica" (
          "_id", "numeroId", "primerNombre", "segundoNombre", "primerApellido", "segundoApellido",
          "celular", "email", "fechaNacimiento", "edad", "genero", "estadoCivil", "hijos", "ejercicio",
          "codEmpresa", "empresa", "cargo", "tipoExamen",
          "encuestaSalud", "antecedentesFamiliares", "empresa1",
          "mdAntecedentes", "mdObsParaMiDocYa", "mdObservacionesCertificado",
          "mdRecomendacionesMedicasAdicionales", "mdConceptoFinal", "mdDx1", "mdDx2",
          "talla", "peso", "motivoConsulta", "diagnostico", "tratamiento",
          "fechaAtencion", "fechaConsulta", "atendido", "pvEstado", "medico"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
        )
        ON CONFLICT ("_id") DO UPDATE SET
          "numeroId" = EXCLUDED."numeroId",
          "primerNombre" = EXCLUDED."primerNombre",
          "segundoNombre" = EXCLUDED."segundoNombre",
          "primerApellido" = EXCLUDED."primerApellido",
          "segundoApellido" = EXCLUDED."segundoApellido",
          "celular" = EXCLUDED."celular",
          "email" = EXCLUDED."email",
          "fechaNacimiento" = EXCLUDED."fechaNacimiento",
          "edad" = EXCLUDED."edad",
          "genero" = EXCLUDED."genero",
          "estadoCivil" = EXCLUDED."estadoCivil",
          "hijos" = EXCLUDED."hijos",
          "ejercicio" = EXCLUDED."ejercicio",
          "codEmpresa" = EXCLUDED."codEmpresa",
          "empresa" = EXCLUDED."empresa",
          "cargo" = EXCLUDED."cargo",
          "tipoExamen" = EXCLUDED."tipoExamen",
          "encuestaSalud" = EXCLUDED."encuestaSalud",
          "antecedentesFamiliares" = EXCLUDED."antecedentesFamiliares",
          "empresa1" = EXCLUDED."empresa1",
          "mdAntecedentes" = EXCLUDED."mdAntecedentes",
          "mdObsParaMiDocYa" = EXCLUDED."mdObsParaMiDocYa",
          "mdObservacionesCertificado" = EXCLUDED."mdObservacionesCertificado",
          "mdRecomendacionesMedicasAdicionales" = EXCLUDED."mdRecomendacionesMedicasAdicionales",
          "mdConceptoFinal" = EXCLUDED."mdConceptoFinal",
          "mdDx1" = EXCLUDED."mdDx1",
          "mdDx2" = EXCLUDED."mdDx2",
          "talla" = EXCLUDED."talla",
          "peso" = EXCLUDED."peso",
          "motivoConsulta" = EXCLUDED."motivoConsulta",
          "diagnostico" = EXCLUDED."diagnostico",
          "tratamiento" = EXCLUDED."tratamiento",
          "fechaAtencion" = EXCLUDED."fechaAtencion",
          "fechaConsulta" = EXCLUDED."fechaConsulta",
          "atendido" = EXCLUDED."atendido",
          "pvEstado" = EXCLUDED."pvEstado",
          "medico" = EXCLUDED."medico",
          "_updatedDate" = NOW()
        RETURNING "_id";
      `;

      const params = [
        data._id,
        data.numeroId,
        data.primerNombre,
        data.segundoNombre || null,
        data.primerApellido,
        data.segundoApellido || null,
        data.celular,
        data.email || null,
        data.fechaNacimiento || null,
        data.edad || null,
        data.genero || null,
        data.estadoCivil || null,
        data.hijos || null,
        data.ejercicio || null,
        data.codEmpresa || null,
        data.empresa || null,
        data.cargo || null,
        data.tipoExamen || null,
        data.encuestaSalud || null,
        data.antecedentesFamiliares || null,
        data.empresa1 || null,
        data.mdAntecedentes || null,
        data.mdObsParaMiDocYa || null,
        data.mdObservacionesCertificado || null,
        data.mdRecomendacionesMedicasAdicionales || null,
        data.mdConceptoFinal || null,
        data.mdDx1 || null,
        data.mdDx2 || null,
        data.talla || null,
        data.peso || null,
        data.motivoConsulta || null,
        data.diagnostico || null,
        data.tratamiento || null,
        data.fechaAtencion || null,
        data.fechaConsulta || null,
        data.atendido || null,
        data.pvEstado || null,
        data.medico || null,
      ];

      const result = await postgresService.query(query, params);

      if (result && result.length > 0) {
        console.log(`✅ [PostgreSQL] Historia clínica guardada: ${data._id}`);
        return true;
      }

      console.warn(`⚠️  [PostgreSQL] No se pudo guardar historia clínica: ${data._id}`);
      return false;
    } catch (error) {
      console.error(`❌ [PostgreSQL] Error guardando historia clínica ${data._id}:`, error);
      return false;
    }
  }

  /**
   * Obtiene una historia clínica por _id
   */
  async getById(id: string): Promise<HistoriaClinicaData | null> {
    try {
      const query = 'SELECT * FROM "HistoriaClinica" WHERE "_id" = $1';
      const result = await postgresService.query(query, [id]);

      if (result && result.length > 0) {
        return result[0] as HistoriaClinicaData;
      }

      return null;
    } catch (error) {
      console.error(`❌ [PostgreSQL] Error obteniendo historia clínica ${id}:`, error);
      return null;
    }
  }

  /**
   * Busca historias clínicas por documento
   */
  async getByNumeroId(numeroId: string): Promise<HistoriaClinicaData[]> {
    try {
      const query = 'SELECT * FROM "HistoriaClinica" WHERE "numeroId" = $1 ORDER BY "_createdDate" DESC';
      const result = await postgresService.query(query, [numeroId]);

      return (result || []) as HistoriaClinicaData[];
    } catch (error) {
      console.error(`❌ [PostgreSQL] Error buscando por numeroId ${numeroId}:`, error);
      return [];
    }
  }
}

export default new HistoriaClinicaPostgresService();
