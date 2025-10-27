import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PatientData {
  // Datos demográficos
  edad?: number;
  genero?: string;
  estadoCivil?: string;
  hijos?: string;
  ejercicio?: string;

  // Datos de empresa
  codEmpresa?: string;
  cargo?: string;
  tipoExamen?: string;

  // Antecedentes
  antecedentesFamiliares?: string;
  encuestaSalud?: string;
  empresa1?: string;
}

export const generateMedicalRecommendations = async (
  patientData: PatientData
): Promise<string> => {
  try {
    // Construir el contexto del paciente
    const context = `
Paciente:
- Edad: ${patientData.edad || 'No especificada'}
- Género: ${patientData.genero || 'No especificado'}
- Estado Civil: ${patientData.estadoCivil || 'No especificado'}
- Hijos: ${patientData.hijos || 'No especificado'}
- Ejercicio: ${patientData.ejercicio || 'No especificado'}

Datos Laborales:
- Empresa: ${patientData.codEmpresa || 'No especificada'}
- Cargo: ${patientData.cargo || 'No especificado'}
- Tipo de Examen: ${patientData.tipoExamen || 'No especificado'}

Antecedentes:
- Antecedentes Familiares: ${patientData.antecedentesFamiliares || 'No especificados'}
- Encuesta de Salud: ${patientData.encuestaSalud || 'No especificada'}
- Cargo Anterior: ${patientData.empresa1 || 'No especificado'}
    `.trim();

    const prompt = `
Eres un médico laboral experto. Basándote en la siguiente información del paciente, genera exactamente 3 recomendaciones médicas laborales específicas y prácticas.

${context}

Instrucciones:
1. Genera exactamente 3 recomendaciones numeradas
2. Cada recomendación debe ser específica para el contexto laboral del paciente
3. Las recomendaciones deben ser prácticas y aplicables
4. Considera los factores de riesgo ocupacional del cargo
5. Ten en cuenta los antecedentes médicos si están disponibles
6. Formato: cada recomendación debe empezar con un número (1., 2., 3.)
7. Sé conciso pero específico (máximo 2-3 líneas por recomendación)
8. NO SUGIERAS PAUSAS ACTIVAS
9. IMPORTANTE: Escribe en texto plano sin formato markdown. NO uses asteriscos (**), negritas, cursivas ni ningún formato especial. Solo texto normal.

Genera las 3 recomendaciones:
    `.trim();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Eres un médico laboral colombiano experto en salud ocupacional. Generas recomendaciones médicas específicas, prácticas y basadas en evidencia.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const recommendations =
      response.choices[0]?.message?.content?.trim() || '';

    if (!recommendations) {
      throw new Error('No se generaron recomendaciones');
    }

    return recommendations;
  } catch (error: any) {
    console.error('Error generating AI recommendations:', error);
    throw new Error(
      `Error al generar recomendaciones con IA: ${error.message}`
    );
  }
};

export default {
  generateMedicalRecommendations,
};
