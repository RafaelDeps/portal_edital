# docs/features/editais_encerrados.feature
Feature: Histórico de editais encerrados e suporte a data/arquivo/
  Como pesquisador ou visitante do Portal de Editais
  Quero que editais arquivados pelo coletor continuem acessíveis sem quebrar links e possam ser consultados em uma página dedicada
  Para preservar o histórico e facilitar a pesquisa de editais anteriores

  Scenario: Edital movido para data/arquivo/ no coletor permanece acessível no portal
    Given um edital previamente sincronizado de "data/output/" que foi movido para "data/arquivo/" no coletor
    When a sincronização diária é executada
    Then o arquivo permanece no portal com o mesmo slug e URL "/editais/<slug>/"
    And nenhuma notificação no Telegram é enviada para esse edital encerrado

  Scenario: Consultar histórico na página "Editais encerrados"
    Given que acesso a rota "/encerrados/" do portal de editais
    When a página for carregada
    Then devo visualizar os editais encerrados ordenados do encerramento mais recente para o mais antigo
    And posso filtrar o histórico digitando no campo de busca

  Scenario: Download de dados abertos inclui histórico completo
    Given que acesso a rota "/dados/" do portal de editais
    When visualizo as informações do arquivo "dados-editais.zip"
    Then o portal informa claramente que o ZIP contém ativos, recentes e o histórico de encerrados/arquivados
