import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildManualProfile,
    decodeXmlBytes,
    parseLattesXml,
    rankEditais,
} from '../../src/utils/lattesMatcher.js';

const SAMPLE_LATTES_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<CURRICULO-VITAE SISTEMA-ORIGEM-XML="LATTES_OFFLINE">
  <DADOS-GERAIS NOME-COMPLETO="Fulano da Silva" CPF="123.456.789-00" EMAIL="fulano@example.com">
    <AREAS-DE-ATUACAO>
      <AREA-DE-ATUACAO NOME-GRANDE-AREA-DO-CONHECIMENTO="CIENCIAS_EXATAS_E_DA_TERRA" NOME-DA-AREA-DO-CONHECIMENTO="Ciência da Computação" NOME-DA-SUB-AREA-DO-CONHECIMENTO="Inteligência Artificial" />
    </AREAS-DE-ATUACAO>
  </DADOS-GERAIS>
  <FORMACAO-ACADEMICA-TITULACAO>
    <GRADUACAO NOME-CURSO="Sistemas de Informação" />
    <MESTRADO NOME-CURSO="Informática" />
    <DOUTORADO NOME-CURSO="Ciência da Computação" />
  </FORMACAO-ACADEMICA-TITULACAO>
  <ATUACOES-PROFISSIONAIS>
    <ATIVIDADES-DE-PARTICIPACAO-EM-PROJETO>
      <PARTICIPACAO-EM-PROJETO>
        <PROJETO-DE-PESQUISA NOME-DO-PROJETO="Diagnóstico em Saúde Digital com Aprendizado de Máquina" />
      </PARTICIPACAO-EM-PROJETO>
    </ATIVIDADES-DE-PARTICIPACAO-EM-PROJETO>
  </ATUACOES-PROFISSIONAIS>
  <PRODUCAO-BIBLIOGRAFICA>
    <PALAVRAS-CHAVE PALAVRA-CHAVE-1="Inteligência Artificial" PALAVRA-CHAVE-2="Saúde Digital" />
  </PRODUCAO-BIBLIOGRAFICA>
</CURRICULO-VITAE>`;

describe('lattesMatcher.js — parser XML e motor de compatibilidade', () => {
    test('decodifica XML em ISO-8859-1 preservando acentuação', () => {
        const latin1Text = '<?xml version="1.0" encoding="ISO-8859-1"?><CURRICULO-VITAE><AREA-DE-ATUACAO NOME-DA-AREA-DO-CONHECIMENTO="Ci\u00eancia e Inova\u00e7\u00e3o"/></CURRICULO-VITAE>';
        const bytes = Uint8Array.from([...latin1Text].map((ch) => ch.charCodeAt(0)));
        const decoded = decodeXmlBytes(bytes);
        assert.ok(decoded.includes('Ciência e Inovação'));
    });

    test('extrai titulação, áreas e palavras-chave do XML do Lattes sem expor dados pessoais', () => {
        const profile = parseLattesXml(SAMPLE_LATTES_XML);
        assert.equal(profile.source, 'lattes_xml');
        assert.equal(profile.titulacao, 'doutorado');
        assert.ok(profile.areas.includes('Ciência da Computação'));
        assert.ok(profile.areas.includes('Inteligência Artificial'));
        assert.ok(profile.palavrasChave.includes('Saúde Digital'));

        const serialized = JSON.stringify(profile);
        assert.equal(serialized.includes('Fulano'), false);
        assert.equal(serialized.includes('123.456.789-00'), false);
        assert.equal(serialized.includes('fulano@example.com'), false);
    });

    test('rejeita XML inválido ou que não seja Currículo Lattes', () => {
        assert.throws(() => parseLattesXml(''), /vazio/i);
        assert.throws(() => parseLattesXml('<html/>'), /CURRICULO-VITAE/);
    });

    test('ranqueia apenas editais abertos/fechando com compatibilidade > 0% e explica motivos', () => {
        const profile = parseLattesXml(SAMPLE_LATTES_XML);
        const editais = [
            {
                id: 'ia-saude',
                nome: 'Chamada de Inteligência Artificial na Saúde Digital',
                descrição: 'Apoio a projetos de aprendizado de máquina aplicados à saúde.',
                orgão_fomento: 'FAPES',
                categoria: 'pesquisa',
                status: 'aberto',
                tags: ['inteligência artificial', 'saúde'],
                elegibilidade: {
                    titulacao_minima: 'doutorado',
                    publico_alvo: ['pesquisador'],
                    areas_conhecimento: ['Ciência da Computação'],
                    requisitos_resumo: 'Doutorado completo.',
                },
            },
            {
                id: 'encerrado-ia',
                nome: 'Edital antigo de Inteligência Artificial',
                descrição: 'Já encerrado.',
                orgão_fomento: 'CNPq',
                categoria: 'pesquisa',
                status: 'encerrado',
                tags: ['inteligência artificial'],
            },
            {
                id: 'sem-match',
                nome: 'Restauro de Acervos Históricos Musicais',
                descrição: 'Preservação de partituras barrocas.',
                orgão_fomento: 'MINC',
                categoria: 'cultura',
                status: 'aberto',
                tags: ['música', 'patrimônio'],
            },
        ];

        const ranked = rankEditais(profile, editais);
        assert.equal(ranked.length, 1);
        assert.equal(ranked[0].edital.id, 'ia-saude');
        assert.ok(ranked[0].score > 0);
        assert.equal(ranked[0].elegibilidadeStatus, 'compativel');
        assert.ok(ranked[0].motivos.some((m) => m.includes('titulação mínima')));
    });

    test('alerta quando perfil manual tem titulação abaixo da titulacao_minima exigida', () => {
        const gradProfile = buildManualProfile({
            titulacao: 'graduacao',
            publicoAlvo: 'estudante_graduacao',
            termos: 'ciência da computação, inteligência artificial',
        });

        const editais = [
            {
                id: 'so-doutor',
                nome: 'Bolsas de Pós-Doutorado em Inteligência Artificial',
                descrição: 'Destinado a doutores em Ciência da Computação.',
                orgão_fomento: 'CNPq',
                categoria: 'pesquisa',
                status: 'fechando',
                tags: ['inteligência artificial'],
                elegibilidade: {
                    titulacao_minima: 'doutorado',
                    areas_conhecimento: ['Ciência da Computação'],
                },
            },
        ];

        const ranked = rankEditais(gradProfile, editais);
        assert.equal(ranked.length, 1);
        assert.equal(ranked[0].elegibilidadeStatus, 'atencao');
        assert.ok(ranked[0].motivos.some((m) => m.includes('exige titulação mínima de Doutorado')));
    });
});
