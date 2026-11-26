# docs/features/indicar_edital.feature
Feature: Indicação de editais pela comunidade
  Como membro da comunidade acadêmica ou cidadão
  Quero indicar um edital aberto diretamente pela página "Como contribuir"
  Para colaborar com a atualização do portal sem informar dados pessoais

  Background:
    Given que acesso a rota "/contribua/" do portal de editais

  Scenario: Visualizar o formulário "Indicar edital" e o aviso de privacidade (LGPD)
    When a página for carregada
    Then devo ver a seção "Indicar edital" com campos para link oficial, órgão, prazo opcional e observações opcionais
    And devo visualizar um aviso claro de privacidade orientando a não informar dados pessoais
    And não devem existir campos solicitando nome pessoal, e-mail, telefone ou CPF

  Scenario: Bloquear envio quando campos obrigatórios não são preenchidos corretamente
    When clico em "Abrir indicação no GitHub" sem preencher os campos obrigatórios
    Then devo ver uma mensagem de erro informando a obrigatoriedade do link oficial e do órgão

  Scenario: Gerar link pré-preenchido da issue no GitHub com os dados informados
    When preencho o link oficial com "https://fapes.es.gov.br/edital-2026"
    And preencho o órgão com "FAPES"
    And preencho o prazo com "15/12/2026"
    And preencho as observações com "Edital de pesquisa aplicada"
    And submeto o formulário "Indicar edital"
    Then o portal deve gerar uma URL para o template "indicar-edital.yml" com label "indicacao-edital" e todos os campos pré-preenchidos
