# docs/features/chamadas_edital.feature
Feature: Chamadas e próxima etapa dos editais
  Como pesquisador ou candidato
  Quero visualizar as chamadas disponíveis e a próxima etapa relevante dos editais
  Para identificar rapidamente qual chamada está aberta e quais prazos estão se aproximando

  Scenario: Edital com várias chamadas destaca a chamada aberta
    Given um edital com 1ª chamada encerrada, 2ª chamada aberta até "2026-12-15" e 3ª chamada prevista
    When acesso a página de detalhes do edital
    Then devo ver o destaque "2ª chamada aberta até 15/12"
    And devo visualizar todas as chamadas com seus períodos e estados separados

  Scenario: Edital com 1 chamada aberta exibe destaque e período
    Given um edital com uma única chamada aberta até "2026-12-20"
    When acesso a página de detalhes do edital
    Then devo ver o destaque da chamada aberta com a data de encerramento "20/12"

  Scenario: Edital com próxima etapa exibe informação no card
    Given um edital com próxima etapa "Encerramento da 2ª chamada" em "2026-12-15"
    When visualizo o card do edital na listagem
    Then devo ver o bloco "Próxima etapa" com o evento e a data "15/12/2026"

  Scenario: JSON antigo sem chamadas e próxima etapa permanece compatível
    Given um edital no formato antigo sem os campos chamadas e proxima_etapa
    When o portal valida e renderiza o edital
    Then não ocorre erro de validação ou build
    And o card e a página do edital renderizam normalmente sem blocos vazios
