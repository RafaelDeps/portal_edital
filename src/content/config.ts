import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { normalizeCategory } from '../utils/category.js';
import { STATUS_VALUES, normalizeStatus, getEffectiveStatus } from '../utils/status.js';

const editais = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./data" }),
  schema: z.object({
    nome: z.string(),
    descrição: z.string(),
    orgão_fomento: z.string(),
    categoria: z.string().transform((value) => normalizeCategory(value)),
    status: z.preprocess((value) => normalizeStatus(value), z.enum(STATUS_VALUES)),
    data_abertura: z.string().or(z.literal("")),
    data_encerramento: z.string().or(z.literal("")),
    link: z.string().url(),
    cronograma: z.array(z.object({
      evento: z.string(),
      data: z.string()
    })).optional().default([]),
    chamadas: z.array(z.object({
      nome: z.string(),
      abertura: z.string().or(z.literal("")),
      encerramento: z.string().or(z.literal("")),
    })).optional().default([]),
    proxima_etapa: z.object({
      evento: z.string(),
      data: z.string(),
    }).nullable().optional().default(null),
    elegibilidade: z.object({
      titulacao_minima: z.string().optional(),
      publico_alvo: z.array(z.string()).optional(),
      areas_conhecimento: z.array(z.string()).optional(),
      requisitos_resumo: z.string().optional(),
    }).nullable().optional().default(null),
    tags: z.array(z.string()).optional(),
  }).transform((data) => ({
    ...data,
    status: getEffectiveStatus(data),
  }))
});

export const collections = {
  'editais': editais,
};
